/* =========================================================
   SIMPLEFOOD — Escáner de productos con octógonos y NOVA
   ========================================================= */

const $ = (id) => document.getElementById(id);
const setText = (id, texto) => { $(id).textContent = texto; };

const formatearUnDecimal = (n) =>
	new Intl.NumberFormat('es-ES', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	}).format(n);

/* =========================================================
   Config
   ========================================================= */
const TIEMPO_REINTENTOS_MS = 3000;
const TIMEOUT_FETCH_MS = 8000;
const OFF_API_V3 = "https://world.openfoodfacts.org/api/v3/product/";
const OFF_FIELDS = [
	"product_name", "product_name_en", "product_name_es",
	"generic_name", "generic_name_es",
	"image_front_url", "image_url", "image_front_small_url", "image_small_url",
	"ingredients_text", "ingredients_text_es",
	"nutriments", "nova_group", "additives_tags",
	"product_quantity_unit",
	"categories_tags",
	"nutriscore_2023_tags"
].join(",");

/* =========================================================
   Estado
   ========================================================= */
let scanner = null;
let escaneando = false;
let ultimoCodigo = null;
let peticionActual = 0; // evita que una respuesta antigua pise a la nueva

/* =========================================================
   Cámara
   ========================================================= */
async function comprobarCamaraDisponible() {
	if (navigator.mediaDevices?.getUserMedia) return;
	const seguro = location.protocol === "https:"
		|| ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
	if (seguro) return;
	throw new Error(
		`La cámara requiere HTTPS (o localhost). Estás en "${location.protocol}//${location.hostname}". ` +
		`Abre la web por https:// o usa la entrada manual.`
	);
}

async function iniciarCamara() {
	if (escaneando) return;
	$("resultado").hidden = true;
	$("error-card").hidden = true;
	setText("estado-escaneo", "");
	ultimoCodigo = null;
	$("camara-panel").hidden = false;

	try {
		// Se comprueba aquí (no a nivel de módulo) para que, si falla el CDN,
		// la entrada manual siga funcionando.
		if (typeof Html5Qrcode === "undefined") {
			throw new Error("No se cargó la librería html5-qrcode. Revisa tu conexión o bloqueadores.");
		}
		await comprobarCamaraDisponible();

		scanner ??= new Html5Qrcode("reader", {
			formatsToSupport: [
				Html5QrcodeSupportedFormats.EAN_13,
				Html5QrcodeSupportedFormats.EAN_8,
				Html5QrcodeSupportedFormats.UPC_A,
				Html5QrcodeSupportedFormats.UPC_E,
			],
			verbose: false,
		});

		await scanner.start(
			{ facingMode: "environment" },
			{ fps: 10, qrbox: { width: 280, height: 160 }, aspectRatio: 4 / 3 },
			onScanSuccess,
			() => { } // errores de frame: ruido normal
		);

		escaneando = true;
		$("btn-iniciar").hidden = true;
		$("btn-detener").hidden = false;
		setText("estado-escaneo", "Buscando código de barras…");
	} catch (error) {
		console.error("[escaner] iniciarCamara:", error);
		await detenerCamara();
		mostrarError(error?.message || String(error));
	}
}

async function detenerCamara() {
	if (scanner) {
		try {
			if (scanner.isScanning) await scanner.stop();
			scanner.clear();
		} catch (e) {
			console.error("[escaner] stop/clear:", e);
		}
	}
	escaneando = false;
	$("btn-iniciar").hidden = false;
	$("btn-detener").hidden = true;
	$("camara-panel").hidden = true;
}

async function onScanSuccess(decodedText) {
	if (decodedText === ultimoCodigo) return;
	ultimoCodigo = decodedText;
	navigator.vibrate?.(180);
	await detenerCamara();
	await procesarCodigo(decodedText);
}

/* =========================================================
   Open Food Facts
   ========================================================= */
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hace fetch con timeout y reintenta solo ante errores de red, 429 y 5xx.
 * Devuelve la respuesta tal cual (también 404), para que el llamador decida.
 */
async function fetchConReintentos(url, intentos = 3) {
	for (let i = 1; ; i++) {
		let resp = null;
		try {
			resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_FETCH_MS) });
		} catch (err) {
			if (i === intentos) throw err;
		}
		if (resp) {
			const reintentable = resp.status === 429 || resp.status >= 500;
			if (!reintentable || i === intentos) return resp;
		}
		await esperar(TIEMPO_REINTENTOS_MS);
	}
}

async function procesarCodigo(codigo) {
	const id = ++peticionActual;
	// setText("estado-escaneo", `Código detectado: ${codigo}. Consultando Open Food Facts…`);
	try {
		const resp = await fetchConReintentos(`${OFF_API_V3}${codigo}?fields=${OFF_FIELDS}`);
		if (id !== peticionActual) return;

		if (resp.status === 404) {
			mostrarError(`Producto no encontrado en Open Food Facts (código ${codigo}).`);
			return;
		}
		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

		const { product } = await resp.json();
		if (id !== peticionActual) return;

		if (!product) {
			mostrarError(`Producto no encontrado en Open Food Facts (código ${codigo}).`);
			return;
		}

		mostrarProducto(product);
		// setText("estado-escaneo", `Código leído: ${codigo}`);
	} catch (error) {
		if (id !== peticionActual) return;
		console.error("[escaner] procesarCodigo:", error);
		const motivo = error?.name === "TimeoutError"
			? "tiempo de espera agotado"
			: (error?.message || error);
		mostrarError(`Error al consultar Open Food Facts: ${motivo}`);
	}
}

/* =========================================================
   Reglas de sellos / NOVA
   ========================================================= */

// Aditivos "cosméticos" (indicadores de ultraprocesado) por rango de número E:
// colorantes, espesantes/emulgentes, potenciadores del sabor y edulcorantes.
// Se excluyen a propósito los de uso culinario común (E330 ácido cítrico,
// E500 bicarbonato, antioxidantes E300-E399...).
const RANGOS_ADITIVOS_COSMETICOS = [[100, 199], [400, 495], [620, 650], [950, 969]];

function esAditivoCosmetico(tag) {
	const m = /^[a-z]{2}:e(\d{3,4})/i.exec(tag);
	if (!m) return false;
	const n = Number(m[1]);
	return RANGOS_ADITIVOS_COSMETICOS.some(([min, max]) => n >= min && n <= max);
}

// Sin tildes, porque el texto se normaliza antes de comparar.
const MARCADORES_ULTRAPROCESADO = [
	"JARABE DE GLUCOSA", "JARABE DE MAIZ", "ALMIDON MODIFICADO",
	"ACEITE DE PALMA", "PROTEINA HIDROLIZADA", "EMULGENTE", "EDULCORANTE"
];

function getGrupoNova(producto) {
	const n = Number(producto?.nova_group);
	if (Number.isInteger(n) && n >= 1 && n <= 4) return n;

	// Respaldo cuando OFF no calcula NOVA: aditivos y marcadores en ingredientes.
	if ((producto.additives_tags ?? []).some(esAditivoCosmetico)) return 4;

	const texto = String(producto.ingredients_text_es || producto.ingredients_text || "")
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
	if (MARCADORES_ULTRAPROCESADO.some((m) => texto.includes(m))) return 4;
	return null;
}

// Etiquetas de categoría (sin prefijo de idioma) que indican bebida o lácteo líquido.
// Se comparan completas para no confundir "milk-chocolate" con "milk".
const CATEGORIAS_LIQUIDAS = new Set([
	"beverages", "beverages-and-beverages-preparations", "drinks", "waters", "juices", "sodas",
	"milks", "bebidas", "aguas", "zumos", "refrescos", "leches"
]);

function getEsLiquido(producto) {
	const u = String(producto.product_quantity_unit || "").toLowerCase();
	if (["ml", "cl", "l"].includes(u)) return true;
	if (["g", "kg", "mg"].includes(u)) return false;

	return (producto.categories_tags ?? []).some((t) => CATEGORIAS_LIQUIDAS.has(t.split(":").pop()));
}

function contieneAlcohol(producto) {
	const alcohol = Number(producto.nutriments?.alcohol_100g ?? NaN);
	if (Number.isFinite(alcohol) && alcohol > 0.5) return true;

	const cats = (producto.categories_tags ?? []).join(" ").toLowerCase();
	const NO_ALCOHOLICO = [
		"non-alcoholic", "sin-alcohol", "sin alcohol", "alcohol-free", "alcoholfree", "zero-alcohol",
		"ginger-beer", "root-beer", "wine-vinegar", "cider-vinegar", "vinegar", "vinagre", "cooking-wine"
	];
	if (NO_ALCOHOLICO.some((t) => cats.includes(t))) return false;

	return /\b(alcoholic|beers?|cervezas?|wines?|vinos?|ciders?|sidras?|spirits|licors?|liqueurs?)\b/.test(cats);
}

/**
 * Extrae la letra (a-e) del array de tags de Nutri-Score 2023.
 * Se exige un separador ('-' o '_') justo antes de la letra para evitar
 * falsos positivos como "not-applicable" (que termina en 'e').
 */
function getNutriscore2023(tags) {
	if (!Array.isArray(tags)) return null;
	for (const tag of tags) {
		const match = tag.match(/(?:^|[-_])([a-e])$/i);
		if (match) return match[1].toLowerCase();
	}
	return null;
}

function getAzucaresLibres(producto) {
	const n = producto.nutriments ?? {};
	if (n["free-sugars_100g"] != null) return Number(n["free-sugars_100g"]);
	if (n["added-sugars_100g"] != null) return Number(n["added-sugars_100g"]);

	const totales = Number(n.sugars_100g ?? 0);
	const cats = (producto.categories_tags ?? []).join(" ").toLowerCase();
	let factor = 1.0;
	if (/\b(?:dair(?:y|ies)|yogurts?|yoghurts?|lacteos?|lácteos?|leches?|quesos?|cheeses?)\b/.test(cats)) factor = 0.5;
	else if (/\b(cereal-bar|barra-de-cereal|cereal-bars|granola)\b/.test(cats)) factor = 0.75;
	return totales * factor;
}

// Umbrales por 100 g (sólidos) o 100 ml (líquidos).
const UMBRALES = {
	solido: { azucar: 10, grasaSat: 4, grasaTot: 20, kcal: 275, sodioMg: 400 },
	liquido: { azucar: 5, grasaSat: 3, grasaTot: 10, kcal: 70, sodioMg: 100 },
};

function calcularSellos(producto, grupoNova, esLiquido) {
	// Sin grupo NOVA no se pueden emitir sellos (regla de negocio).
	// NOVA 1 y 2 tampoco: son alimentos sin procesar o ingredientes culinarios.
	if (grupoNova == null || grupoNova === 1 || grupoNova === 2) return [];

	const max = esLiquido ? UMBRALES.liquido : UMBRALES.solido;
	const n = producto.nutriments ?? {};
	const sodioMg = n.sodium_100g != null
		? Number(n.sodium_100g) * 1000
		: Number(n.salt_100g ?? 0) * 400;

	return [
		["Exceso en azúcares", getAzucaresLibres(producto), max.azucar],
		["Exceso en grasas saturadas", Number(n["saturated-fat_100g"] ?? 0), max.grasaSat],
		["Exceso en grasas totales", Number(n.fat_100g ?? 0), max.grasaTot],
		["Exceso en calorías", Number(n["energy-kcal_100g"] ?? 0), max.kcal],
		["Exceso en sodio", sodioMg, max.sodioMg],
	].filter(([, valor, limite]) => valor > limite).map(([texto]) => texto);
}

/* =========================================================
   Render
   ========================================================= */
function mostrarError(mensaje) {
	$("resultado").hidden = true;
	$("error-card").hidden = false;
	setText("estado-escaneo", "");
	setText("error-msg", mensaje);
}

function mostrarTexto(seccionId, textoId, texto) {
	$(seccionId).hidden = !texto;
	if (texto) setText(textoId, texto);
}

const NUTRIENTES = [
	["energy-kcal", "Energía", "kcal"],
	["fat", "Grasas totales", "g"],
	["saturated-fat", "Grasas saturadas", "g"],
	["carbohydrates", "Hidratos de carbono", "g"],
	["sugars", "Azúcares", "g"],
	["proteins", "Proteínas", "g"],
	["fiber", "Fibra", "g"],
	["salt", "Sal", "g"]
];

function renderizarNutrientes(n, esLiquido) {
	setText("nutrientes-titulo", `Información nutricional (por 100 ${esLiquido ? "ml" : "g"})`);
	const dl = $("nutrientes");
	dl.innerHTML = "";

	for (const [clave, etiqueta, unidad] of NUTRIENTES) {
		const valor = Number(n[`${clave}_100g`] ?? NaN);
		const cont = document.createElement("div");
		const dt = document.createElement("dt");
		const dd = document.createElement("dd");
		dt.textContent = etiqueta;
		dd.textContent = Number.isFinite(valor) ? `${formatearUnDecimal(valor)} ${unidad}` : "—";
		cont.append(dt, dd);
		dl.appendChild(cont);
	}
}

const MENSAJES_SIN_SELLO = {
	null: "No se ha podido averiguar el grupo NOVA.",
	1: "Alimento sin procesar: no corresponde sello negro.",
	2: "Ingrediente culinario: no corresponde sello negro.",
};

function renderizarSellos(producto, esLiquido, grupoNova) {
	const textos = calcularSellos(producto, grupoNova, esLiquido);
	if (contieneAlcohol(producto)) textos.push("Alcohol");

	const cont = $("sellos");
	cont.innerHTML = "";

	for (const texto of textos) {
		const div = document.createElement("div");
		div.className = "octogono";
		div.textContent = texto;
		cont.appendChild(div);
	}

	// El mensaje va fuera del contenedor superpuesto a la foto.
	const msg = $("sellos-msg");
	msg.hidden = textos.length > 0;
	if (textos.length === 0) {
		msg.textContent = MENSAJES_SIN_SELLO[grupoNova] ?? "No supera los umbrales para ningún nutriente crítico.";
	}
}

function renderizarNutriscore(producto, grupoNova) {
	const caja = $("nutriscore-caja");
	const img = $("nutriscore");
	const letra = getNutriscore2023(producto.nutriscore_2023_tags);
	const ultra = grupoNova === 4;

	caja.hidden = !letra;
	if (!letra) return;

	img.src = `images/nutriscore-${ultra ? "" : "2023-"}${letra}.svg`;
	img.alt = `Nutri-Score 2023 ${letra.toUpperCase()}${ultra ? " - ultraprocesado" : ""}`;
	caja.classList.toggle("ultraprocesado", ultra);
}

function mostrarProducto(producto) {
	$("error-card").hidden = true;
	$("resultado").hidden = false;

	const nombre = producto.product_name_es?.trim()
		|| producto.product_name?.trim()
		|| producto.product_name_en?.trim();
	mostrarTexto("nombre-producto", "nombre-producto", nombre);
	mostrarTexto("denominacion-seccion", "denominacion",
		producto.generic_name_es?.trim() || producto.generic_name?.trim());
	mostrarTexto("denominacion-ingredientes", "ingredientes",
		producto.ingredients_text_es?.trim() || producto.ingredients_text?.trim());

	const url = producto.image_front_url
		|| producto.image_url
		|| producto.image_front_small_url
		|| producto.image_small_url;
	const foto = $("foto-producto");
	foto.hidden = !url;
	$("producto-media").classList.toggle("sin-foto", !url);
	if (url) {
		foto.src = url;
		foto.alt = `Foto de ${nombre || "producto"}`;
	}

	const esLiquido = getEsLiquido(producto);
	const grupoNova = getGrupoNova(producto);
	renderizarNutrientes(producto.nutriments ?? {}, esLiquido);
	renderizarSellos(producto, esLiquido, grupoNova);
	renderizarNutriscore(producto, grupoNova);
}

/* =========================================================
   Eventos
   ========================================================= */
$("btn-iniciar").addEventListener("click", async () => {
	$("form-manual-wrap").hidden = true;
	await iniciarCamara();
});

$("btn-detener").addEventListener("click", async () => {
	await detenerCamara();
	setText("estado-escaneo", "");
});

$("btn-manual").addEventListener("click", async () => {
	const wrap = $("form-manual-wrap");
	if (!wrap.hidden) return;
	await detenerCamara();
	setText("estado-escaneo", "");
	wrap.hidden = false;
	$("codigo-manual").focus();
});

$("form-manual").addEventListener("submit", (ev) => {
	ev.preventDefault();
	const codigo = $("codigo-manual").value.trim();
	if (!/^\d{8,14}$/.test(codigo)) {
		mostrarError("Introduce un código numérico de entre 8 y 14 dígitos.");
		return;
	}
	procesarCodigo(codigo);
});

window.addEventListener("pagehide", detenerCamara);

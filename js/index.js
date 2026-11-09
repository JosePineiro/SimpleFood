/* =========================================================
   SIMPLEFOOD — Escáner de productos con octógonos OPS y NOVA
   ========================================================= */

const $ = (id) => document.getElementById(id);

function setText(id, texto) {
	const el = $(id);
	if (el) el.textContent = texto;
}

function hideElement(id, ocultar = true) {
	const el = $(id);
	if (el) el.hidden = ocultar;
}

const formatearUnDecimal = (n) =>
	new Intl.NumberFormat('es-ES', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	}).format(n);

/* =========================================================
   Config
   ========================================================= */
const TIEMPO_REINTENTOS_MS = 3000;
const OFF_API_V3 = "https://world.openfoodfacts.org/api/v3/product/";
const OFF_FIELDS = [
	"product_name", "product_name_en", "product_name_es",
	"generic_name", "generic_name_es",
	"image_front_url", "image_url", "image_front_small_url", "image_small_url",
	"ingredients_text", "ingredients_text_es",
	"nutriments", "nova_group",
	"product_quantity_unit", "nutrition_data_per",
	"categories_tags",
	"nutriscore_2023_tags"
].join(",");

const FORMATOS = [
	Html5QrcodeSupportedFormats.EAN_13,
	Html5QrcodeSupportedFormats.EAN_8,
	Html5QrcodeSupportedFormats.UPC_A,
	Html5QrcodeSupportedFormats.UPC_E,
];

/* =========================================================
   Estado
   ========================================================= */
let scanner = null;
let escaneando = false;
let ultimoCodigo = null;

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

function mostrarPanelCamara(mostrar) {
	const panel = $("camara-panel");
	if (panel) panel.hidden = !mostrar;
}

async function iniciarCamara() {
	if (escaneando) return;
	$("resultado").hidden = true;
	$("error-card").hidden = true;
	setText("estado-escaneo", "");
	ultimoCodigo = null;
	mostrarPanelCamara(true);

	try {
		if (typeof Html5Qrcode === "undefined") {
			throw new Error("No se cargó la librería html5-qrcode. Revisa tu conexión o bloqueadores.");
		}
		await comprobarCamaraDisponible();

		if (!scanner) {
			scanner = new Html5Qrcode("reader", {
				formatsToSupport: FORMATOS,
				verbose: false,
			});
		}

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
		mostrarError(error?.message || String(error));
		await detenerCamara();
	}
}

async function detenerCamara() {
	if (scanner) {
		try {
			if (scanner.isScanning) await scanner.stop();
			await scanner.clear();
		} catch (e) {
			console.error("[escaner] stop/clear:", e);
		}
	}
	escaneando = false;
	$("btn-iniciar").hidden = false;
	$("btn-detener").hidden = true;
	mostrarPanelCamara(false);
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

async function fetchConReintentos(url, maxIntentos = 3) {
	for (let intento = 1; intento <= maxIntentos; intento++) {
		let resp;
		try {
			resp = await fetch(url);
		} catch (err) {
			if (intento === maxIntentos) throw err;
			await esperar(TIEMPO_REINTENTOS_MS);
			continue;
		}
		if (resp.ok) return resp;

		const transitorio = resp.status === 429
			|| (resp.status >= 500 && resp.status <= 599);
		if (!transitorio || intento === maxIntentos) throw new Error(`HTTP ${resp.status}`);
		await esperar(TIEMPO_REINTENTOS_MS);
	}
	throw new Error("fetchConReintentos: estado inesperado");
}

async function procesarCodigo(codigo) {
	setText("estado-escaneo", `Código detectado: ${codigo}. Consultando Open Food Facts…`);
	try {
		const resp = await fetchConReintentos(`${OFF_API_V3}${codigo}?fields=${OFF_FIELDS}`);
		const data = await resp.json();

		if (data.status !== "success" || !data.product) {
			mostrarError(`Producto no encontrado en Open Food Facts (código ${codigo}).`);
			return;
		}

		mostrarProducto(data.product);
		setText("estado-escaneo", `Código leído: ${codigo}`);
	} catch (error) {
		console.error("[escaner] procesarCodigo:", error);
		mostrarError(`Error al consultar Open Food Facts: ${error?.message || error}`);
	}
}

/* =========================================================
   Reglas OPS / NOVA
   ========================================================= */
const ADITIVOS_COSMETICOS = new Set([
	"E102", "E104", "E110", "E122", "E124", "E129", "E132", "E133", "E150", "E151", "E155", "E160", "E161", "E162", "E171",
	"E320", "E321", "E322", "E325", "E326", "E327", "E330", "E331", "E332", "E333", "E334", "E335", "E336", "E337",
	"E338", "E339", "E340", "E341", "E343", "E350", "E351", "E352", "E353", "E354", "E355", "E356", "E357", "E363",
	"E385", "E400", "E401", "E402", "E403", "E404", "E405", "E406", "E407", "E410", "E412", "E413", "E414", "E415",
	"E416", "E417", "E418", "E420", "E421", "E422", "E425", "E426", "E427", "E428", "E430", "E431", "E432", "E433",
	"E434", "E435", "E436", "E440", "E441", "E442", "E444", "E445", "E450", "E451", "E452", "E460", "E461", "E462",
	"E463", "E464", "E465", "E466", "E467", "E468", "E469", "E470", "E471", "E472", "E473", "E474", "E475", "E476",
	"E477", "E478", "E479", "E480", "E481", "E482", "E483", "E491", "E492", "E493", "E494", "E495", "E500", "E501",
	"E503", "E504", "E507", "E508", "E509", "E511", "E512", "E513", "E514", "E515", "E516", "E517", "E520", "E521",
	"E522", "E523", "E524", "E525", "E526", "E527", "E528", "E529", "E530", "E535", "E536", "E538", "E541", "E542",
	"E550", "E551", "E552", "E553", "E554", "E555", "E556", "E558", "E559", "E570", "E574", "E575", "E576", "E577",
	"E578", "E579", "E585", "E620", "E621", "E622", "E623", "E624", "E625", "E626", "E627", "E628", "E629", "E630",
	"E631", "E632", "E633", "E634", "E635", "E640", "E641", "E650", "E900", "E901", "E902", "E903", "E904", "E905",
	"E907", "E912", "E914", "E920", "E921", "E922", "E923", "E924", "E925", "E926", "E927", "E928", "E930", "E938",
	"E939", "E941", "E942", "E943", "E944", "E948", "E949", "E950", "E951", "E952", "E953", "E954", "E955", "E956",
	"E957", "E958", "E959", "E960", "E961", "E962", "E963", "E964", "E965", "E966", "E967", "E968", "E969", "E999"
]);

const MARCADORES_ULTRAPROCESADO = [
	"JARABE DE GLUCOSA", "JARABE DE MAIZ", "JARABE DE MAÍZ", "ALMIDON MODIFICADO", "ALMIDÓN MODIFICADO",
	"ACEITE DE PALMA", "PROTEINA HIDROLIZADA", "PROTEÍNA HIDROLIZADA", "AROMA", "COLORANTE", "EMULGENTE", "EDULCORANTE"
];

function getGrupoNova(producto) {
	const raw = producto?.nova_group;
	const n = Number(raw);
	if (Number.isInteger(n) && n >= 1 && n <= 4) return n;

	const texto = String(producto?.ingredients_text_es || producto?.ingredients_text || "").toUpperCase();
	const aditivos = texto.match(/E\d{3,4}[A-Z]?/g) || [];
	if (aditivos.some((e) => ADITIVOS_COSMETICOS.has(e))) return 4;
	if (MARCADORES_ULTRAPROCESADO.some((m) => texto.includes(m))) return 4;
	return null;
}

function getEsLiquido(producto) {
	const cats = (producto.categories_tags || []).join(" ").toLowerCase();
	if (/\b(?:waters?|aguas?|beverages?|bebidas?|drinks?|juices?|jugos?|zumos?|sodas?|refrescos?|milks?|leches?|smoothies?|batidos?|beers?|cervezas?|wines?|vinos?|ciders?|sidras?)\b/.test(cats)) return true;

	const u = String(producto.product_quantity_unit || "").toLowerCase();
	if (u === "ml" || u === "cl" || u === "l") return true;

	return String(producto.nutrition_data_per || "").toLowerCase().includes("ml");
}

function contieneAlcohol(producto) {
	const alcohol = Number(producto.nutriments?.alcohol_100g ?? NaN);
	if (Number.isFinite(alcohol) && alcohol > 0.5) return true;

	const cats = (producto.categories_tags ?? []).join(" ").toLowerCase();
	const NON_ALCOHOL = [
		"non-alcoholic", "sin-alcohol", "sin alcohol",
		"alcohol-free", "alcoholfree", "zero-alcohol",
		"ginger-beer", "wine-vinegar", "beer-vinegar", "cooking-wine"
	];
	if (NON_ALCOHOL.some(t => cats.includes(t))) return false;

	return /(alcoholic|beer|cerveza|wine|vino|cider|sidra|spirits|licor)/.test(cats);
}

/**
 * Extrae la letra (a-e) del array de tags de Nutri-Score 2023.
 * Se exige un separador ('-' o '_') justo antes de la letra para evitar
 * falsos positivos como "not-applicable" (que termina en 'e').
 * @param {string[]|null|undefined} tags
 * @returns {string|null}
 */
function getNutriscore2023(tags) {
	if (!Array.isArray(tags)) return null;
	for (const tag of tags) {
		const match = tag.match(/(?:^|[-_])([a-e])$/i);
		if (match) return match[1].toLowerCase();
	}
	return null;
}

function estimarAzucaresLibres(producto) {
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

function calcularSellos(producto, grupoNova, esLiquido) {
	// Sin grupo NOVA no se pueden emitir sellos (regla de negocio).
	// NOVA 1 y 2 tampoco: son alimentos sin procesar o ingredientes culinarios.
	if (grupoNova == null || grupoNova === 1 || grupoNova === 2) return [];

	const max = esLiquido
		? { azucar: 3, grasaSat: 5, grasaTot: 10, kcal: 70, sodioMg: 100 }
		: { azucar: 4, grasaSat: 10, grasaTot: 20, kcal: 275, sodioMg: 400 };

	const n = producto.nutriments ?? {};
	const sellos = [];
	if (estimarAzucaresLibres(producto) > max.azucar) sellos.push("Exceso en azúcares");
	if (Number(n["saturated-fat_100g"] ?? 0) > max.grasaSat) sellos.push("Exceso en grasas saturadas");
	if (Number(n.fat_100g ?? 0) > max.grasaTot) sellos.push("Exceso en grasas totales");
	if (Number(n["energy-kcal_100g"] ?? 0) > max.kcal) sellos.push("Exceso en calorías");

	const sodioMg = n.sodium_100g != null
		? Number(n.sodium_100g) * 1000
		: Number(n.salt_100g ?? 0) * 400;
	if (sodioMg > max.sodioMg) sellos.push("Exceso en sodio");

	return sellos;
}

/* =========================================================
   Render
   ========================================================= */
function mostrarError(mensaje) {
	$("resultado").hidden = true;
	$("error-card").hidden = false;
	setText("error-msg", mensaje);
}

function renderizarNutrientes(n, esLiquido) {
	setText("nutrientes-titulo", `Información nutricional (por 100 ${esLiquido ? "ml" : "g"})`);
	const dl = $("nutrientes");
	dl.innerHTML = "";

	const config = [
		["energy-kcal", "Energía", "kcal"],
		["fat", "Grasas totales", "g"],
		["saturated-fat", "Grasas saturadas", "g"],
		["carbohydrates", "Hidratos de carbono", "g"],
		["sugars", "Azúcares", "g"],
		["proteins", "Proteínas", "g"],
		["fiber", "Fibra", "g"],
		["salt", "Sal", "g"]
	];

	for (const [clave, etiqueta, unidad] of config) {
		const valor = n[`${clave}_100g`];
		const cont = document.createElement("div");
		const dt = document.createElement("dt");
		dt.textContent = etiqueta;
		const dd = document.createElement("dd");
		dd.textContent = valor != null ? `${formatearUnDecimal(valor)} ${unidad}` : "—";
		cont.append(dt, dd);
		dl.appendChild(cont);
	}
}

function renderizarSellos(producto, esLiquido, grupoNova) {
	const alcohol = contieneAlcohol(producto);
	const sellos = calcularSellos(producto, grupoNova, esLiquido);

	const cont = $("sellos");
	cont.innerHTML = "";

	const añadirSello = (texto) => {
		const div = document.createElement("div");
		div.className = "octogono";
		div.textContent = texto;
		cont.appendChild(div);
	};

	sellos.forEach(añadirSello);
	if (alcohol) añadirSello("Alcohol");

	if (sellos.length === 0 && !alcohol) {
		const p = document.createElement("p");
		p.className = "card-text";
		if (grupoNova == null) {
			p.textContent = "No se ha podido averiguar el grupo NOVA.";
		} else if (grupoNova === 1) {
			p.textContent = "Alimento sin procesar: no corresponde sello negro.";
		} else if (grupoNova === 2) {
			p.textContent = "Ingrediente culinario: no corresponde sello negro.";
		} else {
			p.textContent = "No supera los umbrales de la OPS para ningún nutriente crítico.";
		}
		cont.appendChild(p);
	}
}

function mostrarProducto(producto) {
	$("error-card").hidden = true;
	$("resultado").hidden = false;

	// Nombre
	const nombre = producto.product_name_es?.trim()
		|| producto.product_name?.trim()
		|| producto.product_name_en?.trim();
	if (nombre) {
		setText("nombre-producto", nombre);
		hideElement("nombre-producto", false);
	} else {
		hideElement("nombre-producto", true);
	}

	// Denominación genérica
	const generico = producto.generic_name_es?.trim() || producto.generic_name?.trim();
	if (generico) {
		setText("denominacion", generico);
		hideElement("denominacion-seccion", false);
	} else {
		hideElement("denominacion-seccion", true);
	}

	// Ingredientes
	const ingredientes = producto.ingredients_text_es?.trim() || producto.ingredients_text?.trim();
	if (ingredientes) {
		setText("ingredientes", ingredientes);
		hideElement("denominacion-ingredientes", false);
	} else {
		hideElement("denominacion-ingredientes", true);
	}

	// Foto del producto
	const img = $("foto-producto");
	const url = producto.image_front_url
		|| producto.image_url
		|| producto.image_front_small_url
		|| producto.image_small_url
		|| "";
	if (url) {
		img.src = url;
		img.alt = `Foto de ${nombre || "producto"}`;
		img.hidden = false;
	} else {
		img.hidden = true;
	}

	// Nutrientes + sellos
	const esLiquido = getEsLiquido(producto);
	const grupoNova = getGrupoNova(producto);
	renderizarNutrientes(producto.nutriments || {}, esLiquido);
	renderizarSellos(producto, esLiquido, grupoNova);

	// Nutri-Score 2023 (campo `nutriscore_2023_tags`)
	const nsImg = $("nutriscore");
	const caja = nsImg.closest(".nutriscore-caja");
	const nutriscore2023 = getNutriscore2023(producto.nutriscore_2023_tags);

	if (nutriscore2023) {
		if (grupoNova === 4) {
			nsImg.src = `images/nutriscore-${nutriscore2023}.svg`;
			nsImg.alt = `Nutri-Score 2023 ${nutriscore2023.toUpperCase()} - ultraprocesado`;
			caja.classList.toggle("ultraprocesado", true);
		} else {
			nsImg.src = `images/nutriscore-2023-${nutriscore2023}.svg`;
			nsImg.alt = `Nutri-Score 2023 ${nutriscore2023.toUpperCase()}`;
			caja.classList.toggle("ultraprocesado", false);
		}

		nsImg.hidden = false;
		caja.hidden = false;
	} else {
		nsImg.hidden = true;
		caja.hidden = true;
	}
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

$("form-manual").addEventListener("submit", (ev) => {
	ev.preventDefault();
	const codigo = $("codigo-manual").value.trim();
	if (!/^\d{8,14}$/.test(codigo)) {
		mostrarError("Introduce un código numérico de entre 8 y 14 dígitos.");
		return;
	}
	ultimoCodigo = codigo;
	procesarCodigo(codigo);
});

$("btn-manual").addEventListener("click", async () => {
	const wrap = $("form-manual-wrap");
	if (!wrap.hidden) return;
	await detenerCamara();
	setText("estado-escaneo", "");
	wrap.hidden = false;
	$("codigo-manual").focus();
});

window.addEventListener("pagehide", detenerCamara);
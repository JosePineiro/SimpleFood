/* =========================================================
   SIMPLEFOOD — Escáner de productos con octógonos OPS y NOVA
   ========================================================= */

function setText(id, texto) {
	const el = document.getElementById(id);
	if (el) el.textContent = texto;
}

function hideElement(id, ocultar = true) {
	const el = document.getElementById(id);
	if (el) el.style.display = ocultar ? 'none' : '';
}

function formatearUnDecimal(numero) {
	return new Intl.NumberFormat('es-ES', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	}).format(numero);
}

/* =========================================================
   Config
   ========================================================= */
const MAX_REINTENTOS = 3;
const TIEMPO_REINTENTOS_MS = 3000; // 3 segundos
const HEADERS = { "User-Agent": "SimpleFood/1.0 (contacto@ejemplo.com)", };
const OFF_API_V3 = "https://world.openfoodfacts.org/api/v3/product/";
const OFF_FIELDS = [
	"product_name",
	"product_name_en",
	"product_name_es",
	"generic_name",
	"generic_name_es",
	"image_front_small_url",
	"image_front_url",
	"image_small_url",
	"image_url",
	"ingredients_text",
	"ingredients_text_es",
	"ingredients_text_en",
	"nutriments",
	"nova_group",
	"product_quantity_unit",
	"nutrition_data_per",
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
   Diagnóstico del contexto (causa #1 habitual)
   ========================================================= */
function verificarContextoSeguro() {
	const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
	const seguro = location.protocol === "https:" || isLocalhost || location.protocol === "file:";
	return { seguro, protocolo: location.protocol, hostname: location.hostname };
}

async function comprobarCamaraDisponible() {
	if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
		const { seguro, protocolo, hostname } = verificarContextoSeguro();
		throw new Error(
			`La cámara requiere HTTPS (o localhost). Estás en "${protocolo}//${hostname}". ` +
			`Abre la web con https:// o prueba la entrada manual del código más abajo.`,
		);
	}
}

/* =========================================================
   Arranque / parada de la cámara
   ========================================================= */
function mostrarPanelCamara(mostrar) {
	const panel = document.getElementById("camara-panel");
	if (panel) panel.hidden = !mostrar;
}

async function iniciarCamara() {
	if (escaneando) return;
	document.getElementById("resultado").hidden = true;
	document.getElementById("error-card").hidden = true;
	setText("estado-escaneo", "");
	ultimoCodigo = null; // permite volver a escanear el mismo producto

	// Mostrar el visor ANTES de crear/arrancar el scanner:
	// html5-qrcode necesita que #reader tenga dimensiones.
	mostrarPanelCamara(true);

	try {
		if (typeof Html5Qrcode === "undefined") {
			throw new Error(
				"No se cargó la librería html5-qrcode. Revisa tu conexión o bloqueadores de anuncios.",
			);
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
			{
				fps: 10,
				qrbox: { width: 280, height: 160 },
				aspectRatio: 4 / 3,
			},
			onScanSuccess,
			onScanError,
		);

		escaneando = true;
		document.getElementById("btn-iniciar").hidden = true;
		document.getElementById("btn-detener").hidden = false;
		setText("estado-escaneo", "Buscando código de barras…");
	} catch (error) {
		console.error("[escaner] iniciarCamara:", error);
		mostrarError(error?.message || String(error));
		await detenerCamara();
	}
}

async function detenerCamara() {
	if (scanner && scanner.isScanning) {
		try {
			await scanner.stop();
			await scanner.clear();
		} catch (e) {
			console.error("[escaner] stop:", e);
		}
	}
	escaneando = false;
	document.getElementById("btn-iniciar").hidden = false;
	document.getElementById("btn-detener").hidden = true;
	mostrarPanelCamara(false); // ← ocultar visor e instrucciones
}
function onScanSuccess(decodedText) {
	if (decodedText === ultimoCodigo) return;
	ultimoCodigo = decodedText;
	navigator.vibrate?.(180);
	detenerCamara().then(() => procesarCodigo(decodedText));
}

function onScanError() {
	// Ruido normal (frames sin código): ignorar.
}

/* =========================================================
   Open Food Facts
   ========================================================= */

// async function procesarCodigo(codigo) {
// 	setText("estado-escaneo", `Código detectado: ${codigo}. Consultando Open Food Facts…`);
// 	try {
// 		const resp = await fetch(`${OFF_API}${codigo}.json?fields=${OFF_FIELDS}`);
// 		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
// 		const data = await resp.json();
// 		if (data.status === 0 || !data.product) {
// 			mostrarError(`Producto no encontrado en Open Food Facts (código ${codigo}).`);
// 			return;
// 		}
// 		mostrarProducto(data.product);
// 		setText("estado-escaneo", `Código leído: ${codigo}`);
// 	} catch (error) {
// 		console.error("[escaner] procesarCodigo:", error);
// 		mostrarError(`Error al consultar Open Food Facts: ${error?.message || error}`);
// 	}
// }
/**
 * Realiza una petición fetch con lógica de reintentos.
 * @param {string} url - La URL a consultar.
 * @returns {Promise<Response>} - La respuesta de la petición.
 */
async function fetchConReintentos(url) {
	for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
		try {
			const resp = await fetch(url, { headers: HEADERS });

			// Si la respuesta es exitosa (2xx), la devolvemos.
			if (resp.ok) {
				return resp;
			}

			// Determinamos si el error es "transitorio" y merece un reintento.
			// 429: Too Many Requests, 5xx: Errores del servidor (503, 500, etc.).
			const esErrorTransitorio = resp.status === 429 || (resp.status >= 500 && resp.status <= 599);

			if (!esErrorTransitorio || intento === MAX_REINTENTOS) {
				// Si no es transitorio o es el último intento, lanzamos el error.
				throw new Error(`HTTP ${resp.status}`);
			}

			// Es un error transitorio y no es el último intento: esperamos y reintentamos.
			console.warn(`[escaner] Intento ${intento} fallido con estado ${resp.status}. Reintentando en ${TIEMPO_REINTENTOS_MS / 1000}s...`);
			await new Promise(resolve => setTimeout(resolve, TIEMPO_REINTENTOS_MS));

		} catch (error) {
			// Si es un error de red (no HTTP) y es el último intento, lo lanzamos.
			if (intento === MAX_REINTENTOS) {
				throw error;
			}
			// Si es un error de red, también esperamos y reintentamos.
			console.warn(`[escaner] Intento ${intento} fallido por error de red. Reintentando en ${TIEMPO_REINTENTOS_MS / 1000}s...`);
			await new Promise(resolve => setTimeout(resolve, TIEMPO_REINTENTOS_MS));
		}
	}
	// Este punto no debería alcanzarse, pero es una salvaguarda.
	throw new Error("Se agotaron todos los intentos.");
}


/**
 * Procesa el código de barras consultando la API v3 de Open Food Facts.
 * @param {string} codigo - El código de barras del producto.
 */
async function procesarCodigo(codigo) {
	setText("estado-escaneo", `Código detectado: ${codigo}. Consultando Open Food Facts…`);
	try {
		// 1. Construimos la URL para la API v3.
		const url = `${OFF_API_V3}${codigo}.json?fields=${OFF_FIELDS}`;
		// const url = `${OFF_API_V3}${codigo}.json`;

		// 2. Usamos la función de fetch con reintentos.
		const resp = await fetchConReintentos(url);
		const data = await resp.json();

		// 3. Si el producto no se encuentra, 'product' estará vacío o no existirá.
		if (data.status !== "success" || !data.product) {
			mostrarError(`Producto no encontrado en Open Food Facts (código ${codigo}).`);
			return;
		}

		// 4. Los datos del producto están anidados en 'data.product'.
		mostrarProducto(data.product);
		setText("estado-escaneo", `Código leído: ${codigo}`);

	} catch (error) {
		console.error("[escaner] procesarCodigo:", error);
		mostrarError(`Error al consultar Open Food Facts: ${error?.message || error}`);
	}
}


/* =========================================================
   Reglas OPS 
   ========================================================= */
/**
 * Obtiene el grupo NOVA (1–4) de un producto.
 * - Si `nova_group` es válido (entero 1–4), se respeta tal cual.
 * - Si no, se infiere analizando los ingredientes: aditivos cosméticos
 *   o marcadores de ultraprocesado → 4; si no hay indicios → null.
 * @param {object} producto
 * @returns {1|2|3|4|null}
 */
function getGrupoNova(producto) {
	// 1. Campo oficial
	const rawNova = producto?.nova_group ?? producto?.nutriments?.nova_group;
	const n = rawNova == null || rawNova === "" ? NaN : Number(rawNova);
	if (Number.isInteger(n) && n >= 1 && n <= 4) return n;

	// 2. Sin dato NOVA: inferir ultraprocesado por ingredientes
	const texto = String(producto?.ingredients_text_es || producto?.ingredients_text || "").toUpperCase();
	const aditivos = texto.match(/E\d{3,4}[A-Z]?/g) || [];
	if (aditivos.some((e) => ADITIVOS_COSMETICOS.has(e))) return 4;
	if (MARCADORES_ULTRAPROCESADO.some((m) => texto.includes(m))) return 4;
	return null;
}

function getEsLiquido(producto) {
	// 1. Comprobación por categorías
	const cats = (producto.categories_tags || []).join(" ").toLowerCase();
	const porCategorias = /\b(water|waters|agua|bebida|beverage|drink|juice|jugo|zumo|soda|refresco|milk|leche|smoothie|batido|beer|cerveza|wine|vino|cider|sidra)\b/.test(cats);
	if (porCategorias) return true;

	// 2. Comprobación por unidad de medida
	const u = String(producto.product_quantity_unit || "").toLowerCase();
	if (u === "ml" || u === "cl" || u === "l") return true;

	// 3. Comprobación por base nutricional (ej: "per 100 ml")
	const b = String(producto.nutrition_data_per || "").toLowerCase();
	if (b.includes("ml")) return true;

	// Si ninguna de las condiciones se cumple, no es líquido
	return false;
}

function contieneAlcohol(producto) {
	// 1. Comprobación por nutrientes
	const alcohol = producto.nutriments?.["alcohol_100g"];
	// Si el campo existe y su valor es mayor que 0, el producto contiene alcohol.
	if (alcohol != null) {
		return Number(alcohol) > 0.5; // La ley considera "sin alcohol" si es e igual o menor a 0.5%
	}

	// 2. Comprobación por categorías
	const cats = (producto.categories_tags || []).join(" ").toLowerCase();

	// Primero descartamos explícitamente si es una categoría "sin alcohol" (non-alcoholic)
	if (cats.includes("non-alcoholic") || cats.includes("sin-alcohol") || cats.includes("0-0")) {
		return false;
	}

	// Si no es un "sin", buscamos raíces clave de bebidas alcohólicas
	// Quitamos \b y usamos expresiones más flexibles para evitar problemas con los guiones de Open Food Facts
	const tienePalabrasAlcohol = /(alcoholic|beer|cerveza|wine|vino|cider|sidra|spirits|licor)/.test(cats);

	return tienePalabrasAlcohol;
}

function estimarAzucaresLibres(producto, n) {
	if (n["free-sugars_100g"] != null) return Number(n["free-sugars_100g"]);
	if (n["added-sugars_100g"] != null) return Number(n["added-sugars_100g"]);
	const totales = Number(n.sugars_100g ?? 0);
	const cats = (producto.categories_tags || []).join(" ").toLowerCase();
	let factor = 1.0;
	if (/\b(dairy|yogurt|yoghurt|lacteo|lácteo|leche|queso|cheese)\b/.test(cats)) factor = 0.5;
	else if (/\b(cereal-bar|barra-de-cereal|cereal-bars|granola)\b/.test(cats)) factor = 0.75;
	return totales * factor;
}

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
	"E957", "E958", "E959", "E960", "E961", "E962", "E963", "E964", "E965", "E966", "E967", "E968", "E969", "E999"]);

const MARCADORES_ULTRAPROCESADO = [
	"JARABE DE GLUCOSA", "JARABE DE MAIZ", "JARABE DE MAÍZ", "ALMIDON MODIFICADO", "ALMIDÓN MODIFICADO",
	"ACEITE DE PALMA", "PROTEINA HIDROLIZADA", "PROTEÍNA HIDROLIZADA", "AROMA", "COLORANTE", "EMULGENTE", "EDULCORANTE"];

function calcularSellos(nutrientes, grupoNova, esLiquido) {
	if (grupoNova === 1 || grupoNova === 2) return [];

	const Maximo = esLiquido
		? { azucar: 3, grasaSat: 5, grasaTot: 10, kcal: 70, sodioMg: 100 }
		: { azucar: 4, grasaSat: 10, grasaTot: 20, kcal: 275, sodioMg: 400 };

	const sellos = [];
	if (estimarAzucaresLibres(nutrientes, nutrientes) > Maximo.azucar) sellos.push("Exceso en azúcares");
	if (Number(nutrientes["saturated-fat_100g"] ?? 0) > Maximo.grasaSat) sellos.push("Exceso en grasas saturadas");
	if (Number(nutrientes.fat_100g ?? 0) > Maximo.grasaTot) sellos.push("Exceso en grasas totales");
	if (Number(nutrientes["energy-kcal_100g"] ?? 0) > Maximo.kcal) sellos.push("Exceso en calorías");

	const sodioMg = nutrientes.sodium_100g != null
		? Number(nutrientes.sodium_100g) * 1000
		: Number(nutrientes.salt_100g ?? 0) * 400;
	if (sodioMg > Maximo.sodioMg) sellos.push("Exceso en sodio");

	return sellos;
}

/* =========================================================
   Render
   ========================================================= */
function mostrarError(mensaje) {
	document.getElementById("resultado").hidden = true;
	document.getElementById("error-card").hidden = false;
	setText("error-msg", mensaje);
}

function renderizarNutrientes(n, esLiquido) {
	setText("nutrientes-titulo", `Información nutricional (por 100 ${esLiquido ? "ml" : "g"})`);
	const dl = document.getElementById("nutrientes");
	dl.innerHTML = "";

	// Configuración de los nutrientes: [Clave_API, Etiqueta, Unidad_Por_Defecto]
	const configNutrientes = [
		["energy-kcal", "Energía", "kcal"],
		["fat", "Grasas totales", "g"],
		["saturated-fat", "Grasas saturadas", "g"],
		["carbohydrates", "Hidratos de carbono", "g"],
		["sugars", "Azúcares", "g"],
		["proteins", "Proteínas", "g"],
		["fiber", "Fibra", "g"],
		["salt", "Sal", "g"]
	];

	for (const [clave, etiqueta, unidadDefecto] of configNutrientes) {
		const valor100g = n[`${clave}_100g`];

		// Determinar la unidad (usa la de la API o la por defecto)
		const unidad = n[`${clave}_unit`] != null ? n[`${clave}_unit`] : unidadDefecto;

		// Formatear el texto final
		const textoValor = valor100g != null
			? `${formatearUnDecimal(valor100g)} ${unidad}`
			: "—";

		// Crear e inyectar el DOM
		const cont = document.createElement("div");
		const dt = document.createElement("dt");
		dt.textContent = etiqueta;
		const dd = document.createElement("dd");
		dd.textContent = textoValor;

		cont.append(dt, dd);
		dl.appendChild(cont);
	}
}


function renderizarSellos(producto, esLiquido) {
	const grupoNova = getGrupoNova(producto);
	const alcohol = contieneAlcohol(producto);
	const sellos = calcularSellos(producto.nutriments, grupoNova, esLiquido);

	const cont = document.getElementById("sellos");
	cont.innerHTML = "";
	for (const texto of sellos) {
		const div = document.createElement("div");
		div.className = "octogono";
		div.textContent = texto;
		cont.appendChild(div);
	}
	if (alcohol) {
		const div = document.createElement("div");
		div.className = "octogono octogono--alcohol";
		div.textContent = "Alcohol";
		cont.appendChild(div);
	}
	if (grupoNova === 4) {
		const div = document.createElement("div");
		div.className = "octogono octogono--ultra";
		div.textContent = "Ultra procesado";
		cont.appendChild(div);
	}
	if (sellos.length === 0 && !alcohol) {
		const p = document.createElement("p");
		p.className = "card-text";
		if (grupoNova === null)
			p.textContent = "No se ha podido averiguar el grupo NOVA."
		if (grupoNova === 1)
			p.textContent = "Alimento sin procesar: no corresponde sello negro."
		else if (grupoNova === 2)
			p.textContent = "Ingrediente culinario: no corresponde sello negro."
		else if (grupoNova === 3)
			p.textContent = "No supera los umbrales de la OPS para ningún nutriente crítico."
		cont.appendChild(p);
	}
}

function mostrarProducto(producto) {
	document.getElementById("error-card").hidden = true;
	document.getElementById("resultado").hidden = false;

	const nombreComercial = producto.product_name_es?.trim() || producto.product_name?.trim() || producto.product_name_en?.trim();
	if (nombreComercial) setText("nombre-producto", nombreComercial);

	const nombreGenerico = producto.generic_name_es?.trim() || producto.generic_name?.trim();
	if (nombreGenerico) {
		setText("denominacion", nombreGenerico);
		hideElement("denominacion-seccion", false);
	}
	else
		hideElement("denominacion-seccion", true);

	const ingredientes = producto.ingredients_text_es?.trim() || producto.ingredients_text?.trim();
	if (ingredientes) {
		setText("ingredientes", ingredientes);
		hideElement("denominacion-ingredientes", false);
	} else
		hideElement("denominacion-ingredientes", true);

	const img = document.getElementById("foto-producto");
	const url = producto.image_front_url || producto.image_url || producto.image_front_small_url || producto.image_small_url || "";
	if (url) {
		img.src = url;
		img.alt = `Foto de ${nombreComercial || "producto"}`;
		img.hidden = false;
	} else {
		img.hidden = true;
	}

	const esLiquido = getEsLiquido(producto);
	renderizarNutrientes(producto.nutriments || {}, esLiquido);
	renderizarSellos(producto, esLiquido);
}

/* =========================================================
   Eventos
   ========================================================= */
document.getElementById("btn-iniciar").addEventListener("click", async () => {
	// Al arrancar la cámara, cerramos la entrada manual (si estaba abierta).
	document.getElementById("form-manual-wrap").hidden = true;

	await iniciarCamara();
});

document.getElementById("btn-detener").addEventListener("click", async () => {
	await detenerCamara();
	setText("estado-escaneo", "");
});

document.getElementById("form-manual").addEventListener("submit", (ev) => {
	ev.preventDefault();
	const codigo = document.getElementById("codigo-manual").value.trim();
	if (!/^\d{8,14}$/.test(codigo)) {
		mostrarError("Introduce un código numérico de entre 8 y 14 dígitos.");
		return;
	}
	ultimoCodigo = codigo;
	procesarCodigo(codigo);
});

window.addEventListener("pagehide", detenerCamara);

const btnManual = document.getElementById("btn-manual");
btnManual.addEventListener("click", async () => {
	const formManualWrap = document.getElementById("form-manual-wrap");

	// Si ya está visible, no hace nada: el cierre lo provoca "Iniciar cámara".
	if (!formManualWrap.hidden) return;

	// Nos aseguramos de parar la cámara y ocultar #camara-panel antes de mostrar el formulario.
	await detenerCamara();
	setText("estado-escaneo", "");

	formManualWrap.hidden = false;
	document.getElementById("codigo-manual").focus();
});
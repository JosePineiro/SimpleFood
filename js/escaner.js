/* =========================================================
   SIMPLEGYM — Escáner de productos con octógonos OPS y NOVA
   Usa html5-qrcode (cargado en el HTML como UMD global).
   ========================================================= */

/* ---------- Helper local (sin dependencias externas) ---------- */
function setText(id, texto) {
	const el = document.getElementById(id);
	if (el) el.textContent = texto;
}

/* =========================================================
   Config
   ========================================================= */
const OFF_API = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_FIELDS = [
	"product_name",
	"product_name_es",
	"generic_name",
	"generic_name_es",
	"image_front_url",
	"image_url",
	"ingredients_text",
	"ingredients_text_es",
	"nutriments",
	"nova_group",
	"product_quantity_unit",
	"nutrition_data_per",
	"categories_tags",
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
async function iniciarCamara() {
	if (escaneando) return;
	document.getElementById("resultado").hidden = true;
	document.getElementById("error-card").hidden = true;
	setText("estado-escaneo", "");

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
				// Caja ancha para códigos 1D (los QR necesitan cuadrada)
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
async function procesarCodigo(codigo) {
	setText("estado-escaneo", `Código detectado: ${codigo}. Consultando Open Food Facts…`);
	try {
		const resp = await fetch(`${OFF_API}${codigo}.json?fields=${OFF_FIELDS}`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
		const data = await resp.json();
		if (data.status === 0 || !data.product) {
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
function getGrupoNova(producto) {
	const n = parseInt(producto.nova_group, 10);
	return n >= 1 && n <= 4 ? n : null;
}

function esLiquido(producto) {
	const u = String(producto.product_quantity_unit || "").toLowerCase();
	if (u) return u === "ml" || u === "cl" || u === "l";
	const b = String(producto.nutrition_data_per || "").toLowerCase();
	if (b) return b.includes("ml");
	const cats = (producto.categories_tags || []).join(" ").toLowerCase();
	return /\b(water|waters|agua|bebida|beverage|drink|juice|jugo|zumo|soda|refresco|milk|leche|smoothie|batido)\b/.test(cats);
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
	"E957", "E958", "E959", "E960", "E961", "E962", "E963", "E964", "E965", "E966", "E967", "E968", "E969", "E999",
]);

function esUltraprocesado(producto) {
	const g = getGrupoNova(producto);
	if (g === 4) return true;
	if (g === 1 || g === 2 || g === 3) return false;
	const texto = String(producto.ingredients_text_es || producto.ingredients_text || "").toUpperCase();
	const nums = texto.match(/E\d{3,4}[A-Z]?/g) || [];
	if (nums.some((e) => ADITIVOS_COSMETICOS.has(e))) return true;
	const marcadores = [
		"JARABE DE GLUCOSA", "JARABE DE MAIZ", "JARABE DE MAÍZ", "ALMIDON MODIFICADO", "ALMIDÓN MODIFICADO",
		"ACEITE DE PALMA", "PROTEINA HIDROLIZADA", "PROTEÍNA HIDROLIZADA", "AROMA", "AROMAS",
		"COLORANTE", "EMULGENTE", "EDULCORANTE",
	];
	return marcadores.some((m) => texto.includes(m));
}

function calcularSellos(producto) {
	const g = getGrupoNova(producto);
	if (g === 1 || g === 2) return [];

	const n = producto.nutriments || {};
	const liq = esLiquido(producto);
	const T = liq
		? { azucar: 3, grasaSat: 5, grasaTot: 10, kcal: 70, sodioMg: 100 }
		: { azucar: 4, grasaSat: 10, grasaTot: 20, kcal: 275, sodioMg: 400 };

	const sellos = [];
	if (estimarAzucaresLibres(producto, n) > T.azucar) sellos.push("Exceso en azúcares");
	if (Number(n["saturated-fat_100g"] ?? 0) > T.grasaSat) sellos.push("Exceso en grasas saturadas");
	if (Number(n.fat_100g ?? 0) > T.grasaTot) sellos.push("Exceso en grasas totales");
	if (Number(n["energy-kcal_100g"] ?? 0) > T.kcal) sellos.push("Exceso en calorías");

	const sodioMg = n.sodium_100g != null
		? Number(n.sodium_100g) * 1000
		: Number(n.salt_100g ?? 0) * 400;
	if (sodioMg > T.sodioMg) sellos.push("Exceso en sodio");

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

function renderizarNutrientes(n) {
	const dl = document.getElementById("nutrientes");
	dl.innerHTML = "";
	const filas = [
		["Energía", n["energy-kcal_100g"] != null ? `${n["energy-kcal_100g"]} kcal` : "—"],
		["Grasas totales", n.fat_100g != null ? `${n.fat_100g} g` : "—"],
		["Grasas saturadas", n["saturated-fat_100g"] != null ? `${n["saturated-fat_100g"]} g` : "—"],
		["Azúcares", n.sugars_100g != null ? `${n.sugars_100g} g` : "—"],
		["Sal", n.salt_100g != null ? `${n.salt_100g} g` : "—"],
	];
	for (const [etiqueta, valor] of filas) {
		const cont = document.createElement("div");
		const dt = document.createElement("dt");
		dt.textContent = etiqueta;
		const dd = document.createElement("dd");
		dd.textContent = valor;
		cont.append(dt, dd);
		dl.appendChild(cont);
	}
}

function renderizarSellos(producto) {
	const cont = document.getElementById("sellos");
	cont.innerHTML = "";
	const sellos = calcularSellos(producto);
	const ultra = esUltraprocesado(producto);

	for (const texto of sellos) {
		const div = document.createElement("div");
		div.className = "octogono";
		div.textContent = texto;
		cont.appendChild(div);
	}
	if (ultra) {
		const div = document.createElement("div");
		div.className = "octogono octogono--ultra";
		div.textContent = "Ultraprocesado";
		cont.appendChild(div);
	}
	if (sellos.length === 0 && !ultra) {
		const p = document.createElement("p");
		p.className = "card-text";
		const g = getGrupoNova(producto);
		p.textContent = (g === 1 || g === 2)
			? "Alimento sin procesar o ingrediente culinario: no corresponde sello negro."
			: "No supera los umbrales de la OPS para ningún nutriente crítico.";
		cont.appendChild(p);
	}
}

function mostrarProducto(producto) {
	document.getElementById("error-card").hidden = true;
	document.getElementById("resultado").hidden = false;

	const nombre =
		producto.product_name_es ||
		producto.product_name ||
		producto.generic_name_es ||
		producto.generic_name ||
		"Denominación no disponible";

	setText("nombre-producto", nombre);
	setText("denominacion", nombre);

	const img = document.getElementById("foto-producto");
	const url = producto.image_front_url || producto.image_url || "";
	if (url) {
		img.src = url;
		img.alt = `Foto de ${nombre}`;
		img.hidden = false;
	} else {
		img.hidden = true;
	}

	setText("ingredientes", producto.ingredients_text_es || producto.ingredients_text || "Ingredientes no disponibles.");
	renderizarNutrientes(producto.nutriments || {});
	renderizarSellos(producto);
}

/* =========================================================
   Eventos
   ========================================================= */
document.getElementById("btn-iniciar").addEventListener("click", iniciarCamara);
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
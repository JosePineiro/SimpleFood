# SIMPLEFOOD

> Escáner de productos de alimentación con octógonos negros, Nutri-Score 2023 y grupos NOVA.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/es/docs/Web/CSS)
[![Open Food Facts](https://img.shields.io/badge/Open_Food_Facts-API_v3-4C9F38?logo=openfoodfacts&logoColor=white)](https://world.openfoodfacts.org/)
[![html5-qrcode](https://img.shields.io/badge/html5--qrcode-2.3.8-FF6384)](https://github.com/mebjas/html5-qrcode)

**SIMPLEFOOD** es una aplicación web sin instalación que escanea el código de barras de un
producto y consulta sus datos en [Open Food Facts](https://world.openfoodfacts.org/). En una
sola pantalla muestra la información nutricional relevante junto con advertencias visuales
—octógonos negros, Nutri-Score 2023 y grupo NOVA— para ayudarte a elegir mejor.

---

## 🚀 Uso online

Abre la aplicación directamente en el navegador, sin instalar nada:

👉 **<https://josepineiro.github.io/SimpleFood/index.html>**

Al pulsar **«Escanear código»** el navegador pedirá permiso para usar la cámara. Si prefieres
no usarla, puedes **introducir el código numérico a mano** (8–14 dígitos).

> ⚠️ La cámara **solo funciona sobre HTTPS o `localhost`**. Si abres el `index.html` desde el
> sistema de ficheros (`file://`) el escáner no podrá arrancar, pero la entrada manual sí funcionará.

---

## ✨ Características

- **Escaneo con cámara** de códigos EAN-13, EAN-8, UPC-A y UPC-E (cámara trasera por defecto).
- **Entrada manual** del código numérico (8–14 dígitos) cuando la cámara no está disponible
  o el código está dañado.
- **Consulta a Open Food Facts** (API v3) con timeout y reintentos automáticos ante errores
  de red, `429` o `5xx`.
- **Foto y nombre** del producto tal como aparecen en la base de datos.
- **Lista de ingredientes** legible, sin depender del contraste ni del tamaño del envase.
- **Información nutricional** por 100 g / 100 ml: energía, grasas totales, grasas saturadas,
  hidratos de carbono, azúcares, fibra, proteínas y sal.
- **Octógonos negros** de advertencia (azúcares, grasas saturadas, grasas totales, calorías y
  sodio) con **umbrales distintos para sólidos y líquidos**.
- **Aviso de alcohol** cuando el producto es una bebida alcohólica o supera 0,5 g/100 g de
  alcohol.
- **Nutri-Score 2023** (A–E) con **marco negro «ULTRAPROCESADO»** cuando el producto
  pertenece al grupo NOVA 4.
- **Detección del grupo NOVA** (1–4) usando el dato de Open Food Facts o, si no viene
  informado, a partir de los aditivos cosméticos (colorantes, espesantes, emulgentes,
  potenciadores del sabor y edulcorantes) y de marcadores habituales en la lista de
  ingredientes.
- **Páginas de ayuda** que explican cada sello, el Nutri-Score y los grupos NOVA, con
  **enlaces directos** desde los propios sellos del resultado.
- **Sin guardar datos**: no se almacenan códigos, imágenes ni historial. La app solo envía
  el código numérico a Open Food Facts.

---

## 🧱 Stack

| Capa | Tecnología |
|------|------------|
| Interfaz | HTML5, CSS3 y JavaScript ES Modules |
| Escáner | [html5-qrcode](https://github.com/mebjas/html5-qrcode) 2.3.8 (CDN) |
| Datos | [Open Food Facts API v3](https://world.openfoodfacts.org/) |
| Empaquetado | Ninguno; se ejecuta directamente desde el navegador |

Sin frameworks y sin bundler. Solo ficheros estáticos servidos desde cualquier hosting.

---

## 🚀 Puesta en marcha

### 1. IDE

El proyecto se ha desarrollado con Visual Studio Code. Si usas ese IDE, la extensión
**Live Server** es la forma más cómoda de servir los ficheros en local.

### 2. Clonar el repositorio

```bash
git clone https://github.com/JosePineiro/SimpleFood.git
cd SimpleFood
```

### 3. Servir los ficheros

Cualquier servidor estático sirve. Dos opciones rápidas:

```bash
# Con Python 3
python3 -m http.server 8080

# Con Node.js
npx serve .
```

Después abre <http://localhost:8080> en el navegador.

> En `localhost` la cámara funciona aunque el protocolo sea `http://`. Para probar desde el
> móvil en red local o en un dominio público **necesitas HTTPS**.

---

## 📂 Estructura del proyecto

```text
SimpleFood/
├── index.html                 # Panel principal (escáner)
├── ayuda.html                 # Ayuda general
├── ayuda-sellos.html          # Explicación de sellos, Nutri-Score y NOVA
├── favicon.svg
├── images/                    # Logos del Nutri-Score 2023
│   ├── nutriscore-2023-a.svg
│   ├── nutriscore-2023-b.svg
│   ├── nutriscore-2023-c.svg
│   ├── nutriscore-2023-d.svg
│   ├── nutriscore-2023-e.svg
│   ├── nutriscore-a.svg       # Variantes para usar con el marco «ultraprocesado»
│   ├── nutriscore-b.svg
│   ├── nutriscore-c.svg
│   ├── nutriscore-d.svg
│   └── nutriscore-e.svg
├── css/
│   └── styles.css
├── js/
│   └── index.js               # Lógica del escáner (módulo ES)
├── LICENSE.txt
└── README.md
```

---

## 🖥️ Uso rápido

1. Abre `index.html` en el navegador.
2. Pulsa **«Escanear código»** y concede permiso a la cámara, **o** pulsa
   **«Introducir código»** y escribe los dígitos que aparecen bajo el código de barras.
3. Apunta al código dentro del recuadro hasta que se detecte. La cámara se detiene sola y
   se consulta el producto.
4. Revisa el resultado:
   - **Octógonos negros** sobre la foto → pulsa cualquiera para abrir su explicación.
   - **Nutri-Score** (A–E) → pulsa la letra para abrir la ayuda correspondiente.
   - **Ingredientes** e **información nutricional** por 100 g / 100 ml.
5. Si quieres leer con detalle los criterios y límites aplicados, consulta
   [`ayuda.html`](ayuda.html) y [`ayuda-sellos.html`](ayuda-sellos.html).

---

## 🔒 Privacidad

La aplicación **no guarda nada** de lo que escaneas: ni imágenes de la cámara, ni códigos,
ni historial. Solo se envía el código numérico a Open Food Facts para obtener los datos del
producto. No hay cuentas, ni registro, ni cookies de seguimiento.

---

## ⚖️ Aviso legal

Esta aplicación tiene una finalidad exclusivamente **informativa y educativa**. No
constituye consejo médico, nutricional ni dietético, y no sustituye la valoración de un
profesional sanitario. Los sellos, la letra Nutri-Score y el marco de «ultraprocesado» son
**interpretaciones automáticas** calculadas a partir de los datos disponibles y pueden no
coincidir con el etiquetado real del envase. La etiqueta del envase es siempre la fuente
fiable. Para más detalle, consulta el apartado de aviso legal en [`ayuda.html`](ayuda.html#aviso).

---

## 🧪 Estado del proyecto

Aplicación estable, en uso personal. Sin tests automatizados. Se aceptan *issues* y *pull
requests* siempre que mantengan el espíritu minimalista del proyecto.

---

## 📄 Licencia

Distribuido bajo la **Licencia MIT**. Consulta [`LICENSE.txt`](LICENSE.txt) para más
información.

```text
MIT License · Copyright (c) 2026 Jose M. Piñeiro
```

---

## 🙏 Créditos

- **Autor:** Jose M. Piñeiro
- **Datos:** [Open Food Facts](https://world.openfoodfacts.org/), base de datos
  colaborativa y abierta.
- **Escáner:** [html5-qrcode](https://github.com/mebjas/html5-qrcode), de Minhaz.
- **Nutri-Score:** algoritmo público de Santé publique France (versión 2023).
- **NOVA:** clasificación de alimentos según su grado de procesamiento industrial
  (Monteiro et al.).
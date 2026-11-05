# SIMPLEGYM 🏋️

> Cuaderno de entrenamiento minimalista para seguir tu rutina de fuerza con progresión automática y estadísticas históricas.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2023-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![Firebase](https://img.shields.io/badge/Firebase-12.0.0-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.4.4-FF6384?logo=chartdotjs&logoColor=white)](https://www.chartjs.org/)

**SIMPLEGYM** es una aplicación web sin instalación que actúa como cuaderno de entrenamiento. No genera rutinas por ti: tú sigues el plan que ya tienes cargado y la aplicación te indica qué toca hoy, te guía serie a serie, calcula la progresión de peso y muestra tu evolución a lo largo del tiempo.
Su filosofía es ser una aplicación simple, sencilla e intuitiva. Así te puedes centrar en el ejercicio y no pierdes tiempo navegando entre pantallas e introduciendo un monton de datos.

---

## 🚀 Puesta en marcha
- Si solamente deseas usarla pon esta dirección en tu navegador: https://josepineiro.github.io/SimpleGym/index.html
- A continuación lee la ayuda para saber como introducir los ejercicios.
---

## ✨ Características

- 📋 **Rutina en sesiones rotativas** — Las sesiones se alternan cíclicamente: `1 → 2 → 3 → 4 → 1 …`
- ⏱️ **Guía serie a serie** — Series de aproximación y series de trabajo con peso y repeticiones objetivo, además de temporizador de descanso con aviso sonoro y vibración.
- 📈 **Progresión automática** — Basada en el rango de repeticiones del ejercicio y en el último registro. Sube peso al llegar al máximo y reinicia el rango.
- 🔁 **Sesión de descarga** — Reduce el volumen automáticamente cuando lo necesites.
- 📊 **Estadísticas completas**
  - Por **ejercicio**: evolución del 1RM con fórmula de Epley, récords, rachas, frecuencia y volumen total.
  - Por **sesión**: volumen a lo largo del tiempo, récords y rachas.
  - Por **día**: calendario en mapa de calor con sesiones incompletas, completas o con progreso.
- 💾 **Persistencia multi-dispositivo** — Firebase Auth con Google o Microsoft y Firestore con caché local persistente. Tus datos están en todos tus dispositivos.
- 📥 **Importar y exportar**
  - Ejercicios en **JSON**.
  - Historial de entrenamiento en **CSV**.
- 📱 **Diseño responsive** — Optimizado para móvil, con persistencia local del progreso si el navegador cierra la pestaña a mitad de un ejercicio.

---

## 🧱 Stack

| Capa | Tecnología |
|------|------------|
| Interfaz | HTML5, CSS3 y JavaScript ES Modules (`.mjs`) |
| Autenticación | Firebase Auth (Google y Microsoft) |
| Base de datos | Firestore con `persistentLocalCache` |
| Gráficos | Chart.js 4.4.4 y `chartjs-plugin-zoom` 2.2.0 |
| Empaquetado | Ninguno; se ejecuta directamente desde el navegador |

Sin frameworks y sin bundler. Solo ficheros estáticos servidos desde cualquier hosting.

---

## 🚀 Puesta en marcha

### 1. IDE

Esta aplicación ha sido desarrollada con Visual Studio Code. Si usas ese IDE todas las dependencias se instalarán automáticamente.


### 2. Clonar el repositorio

```bash
git clone https://github.com/<usuario>/simplegym.git
cd simplegym
```

### 3. Servir los ficheros

La aplicación usa ES Modules y Firebase, así que no funciona abriendo los HTML con `file://`. Necesitas un servidor HTTP local:

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# PHP
php -S localhost:8080
```

Después, abre `http://localhost:8080` en el navegador.

### 4. Configurar Firebase

La configuración de Firebase está en `js/database.mjs`:

```js
const firebaseConfig = {
  apiKey: "…",
  authDomain: "simplegym-8e10e.firebaseapp.com",
  projectId: "simplegym-8e10e",
  // …
};
```

La `apiKey` de Firebase es pública por diseño. Lo que protege los datos son las reglas de seguridad de Firestore. Si despliegas tu propia instancia, crea un proyecto en Firebase Console, activa los proveedores de Google y Microsoft, y sustituye `firebaseConfig` por el de tu proyecto.

### 5. Importar ejercicios

La aplicación no incluye ejercicios predeterminados. Puedes usar uno de los ejemplos incluidos:

- [`ejercicios-technogym.json`](ejercicios-technogym.json)
- [`ejercicios-mancuernas.json`](ejercicios-mancuernas.json)

En el panel principal, pulsa **Importar** y selecciona el fichero.

---

## 📂 Estructura del proyecto

```text
simplegym/
├── index.html                     # Panel principal
├── sesion.html                    # Ejercicios de la sesión del día
├── entrenar-ejercicio.html        # Pantalla de entrenamiento
├── ayuda.html                     # Documentación de uso
├── estadisticas-ejercicios.html   # Lista de ejercicios
├── estadisticas-ejercicio.html    # Estadísticas de un ejercicio
├── estadisticas-sesiones.html     # Lista de sesiones
├── estadisticas-sesion.html       # Estadísticas de una sesión
├── estadisticas-dias.html         # Calendario de entrenamiento
├── images/                        # Todas las imagenes de los ejercicios, auque pueden estar en cualquier otro servidor.
├── css/
│   └── styles.css
├── js/
│   ├── database.mjs
│   ├── utils.mjs
│   ├── index.mjs
│   ├── sesion.mjs
│   ├── entrenar-ejercicio.mjs
│   ├── estadisticas-ejercicio.mjs
│   ├── estadisticas-ejercicios.mjs
│   ├── estadisticas-sesion.mjs
│   ├── estadisticas-sesiones.mjs
│   └── estadisticas-dias.mjs
├── ejercicios-technogym.json
├── ejercicios-mancuernas.json
├── favicon.svg
└── LICENSE.txt
└── README.md
```

---

## 🗂️ Formato del JSON de ejercicios

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `number` | Identificador único. |
| `orden` | `number` | Posición dentro de la sesión. |
| `imagen` | `string` | Ruta a la imagen ilustrativa. Puede ser absoluta o relativa |
| `nombre` | `string` | Nombre del ejercicio. |
| `descripcion` | `string` | Descripción técnica. |
| `incremento_peso` | `number` | Salto mínimo de peso en kg. |
| `sesiones` | `number[]` | Sesiones en las que aparece. |
| `series_trabajo` | `number` | Series efectivas. |
| `series_aproximacion` | `number` | Series de calentamiento. |
| `repeticiones_min` | `number` | Mínimo de repeticiones del rango. |
| `repeticiones_max` | `number` | Máximo de repeticiones del rango. |
| `rir` | `number` | Repeticiones en reserva. |
| `descanso` | `number` | Descanso entre series en segundos. |

Ejemplo mínimo:

```json
[
  {
    "id": 1,
    "orden": 1,
    "imagen": "images/leg-press.avif",
    "nombre": "Leg Press",
    "descripcion": "Empuja con los talones sin bloquear las rodillas.",
    "incremento_peso": 10,
    "sesiones": [1, 3],
    "series_trabajo": 2,
    "series_aproximacion": 2,
    "repeticiones_min": 9,
    "repeticiones_max": 13,
    "rir": 3,
    "descanso": 150
  }
]
```

---

## 🧠 Cómo funciona la progresión

Cada ejercicio tiene un rango de repeticiones. Al terminar un ejercicio, anotas el peso y las repeticiones de la última serie. La aplicación calcula la próxima sesión así:

1. Si llegaste al máximo del rango, sube el peso en `incremento_peso` y reinicia las repeticiones al mínimo.
2. Si no llegaste al máximo, mantiene el peso y te pide una repetición más que la vez anterior.
3. Si no llegaste al mínimo, baja el peso y te pone las repeticiones máximo.
4. En sesión de descarga, reduce el volumen y el peso, y el registro no cuenta para la progresión.

La fórmula de 1RM usada en las estadísticas es Epley:

```text
1RM = peso × (1 + reps / 30)
```

---

## ☁️ Cómo se guardan los datos

- **Sesión de usuario** — Firebase Auth con Google o Microsoft.
- **Histórico de entrenamiento** — Empaquetado binario comprimido y guardado en Firestore.
- **Ejercicios** — JSON guardado en Firestore.
- **Caché local** — Firestore `persistentLocalCache` con `persistentMultipleTabManager`.
- **Progreso por ejercicio** — `localStorage` con clave diaria.

> ⚠️ No hay recuperación de cuenta. Si pierdes el acceso a tu cuenta de Google o Microsoft, pierdes los datos. Exporta tu historial a CSV periódicamente como copia de seguridad.

---

## 🖥️ Uso rápido

1. Entra con **Google** o **Microsoft**.
2. Importa tu JSON de ejercicios.
3. En el panel principal verás qué sesión toca hoy.
4. Entra en la sesión, elige un ejercicio y sigue las indicaciones serie a serie.
5. Al terminar el ejercicio, anota peso y repeticiones de la última serie y pulsa **Guardar**.
6. Consulta **Estadísticas → Ejercicios / Sesiones / Días** para ver tu progreso.

---

## 🧪 Estado del proyecto

Aplicación estable, en uso personal. Sin tests automatizados. Se aceptan issues y pull requests siempre que mantengan el espíritu minimalista del proyecto.

---

## 📄 Licencia

Distribuido bajo la **Licencia MIT**. Consulta [`LICENSE.txt`](LICENSE.txt) para más información.

```text
MIT License · Copyright (c) 2026 Jose M. Piñeiro
```

---

## 🙏 Créditos

- **Autor:** Jose M. Piñeiro
- **Fórmula 1RM:** Boyd Epley
- **Firebase** y **Chart.js** por sus respectivos autores.

---

<p align="center">
  <em>«La constancia importa más que la perfección.»</em><br>
  <strong>¡A entrenar! 💪</strong>
</p>
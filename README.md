# Recibo de sueldo de encargados de consorcio

Aplicación web (React + Vite + TypeScript) para armar la liquidación y un recibo de haberes del encargado de un consorcio en Argentina.

Incluye: datos del consorcio y del empleado, **escalas de referencia SUTERH/FATERYH (CCT 589/10 y 590/10)** y **UTHGRA CCT 401/05** (comedores), **suma fija remunerativa** SUTERH (referencia editable, opción al elegir escala), **antigüedad** (por fecha de ingreso o años manuales, % anual sobre el básico), **horas extras** al 50% y 100% con divisor de horas mensuales, haberes y descuentos editables, **descarga en PDF** (jspdf + html2canvas) e **impresión** del navegador.

## Uso local

```bash
npm install
npm run dev
```

Generá PDF desde el navegador con **Imprimir / PDF** (impresión a archivo).

## Build

```bash
npm run build
npm run preview
```

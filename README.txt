PRESUPUESTADOR DE MUEBLES — V0.4

Esta versión organiza la aplicación en dos secciones superiores:
1. Cálculo de mueble
2. Base de materiales

Cambios principales:
- Base de materiales separada del cálculo.
- Cada material guarda nombre, grosor y precio por m².
- El cálculo empieza seleccionando un material del catálogo.
- El grosor del mueble se toma automáticamente del material elegido.
- Despiece y costo de tablero se calculan por m² de piezas cortadas a medida.
- Previsualización 3D construida con geometría real: el espesor es proporcional al resto de las dimensiones.
- Vista inicial axonométrica con órbita, zoom y botón para restablecer.
- Sin fondo trasero, respetando el mueble de prueba.
- Materiales guardados en localStorage por ahora.

IMPORTANTE — VISOR 3D
Three.js se carga desde jsDelivr. Para usar el visor 3D, el navegador necesita conexión a Internet cuando abre la aplicación. La guía oficial de Three.js admite importar la librería desde CDN mediante import maps.

PARA PROBAR LOCALMENTE
1. Abrí una terminal en esta carpeta.
2. Ejecutá: python3 -m http.server 8000
3. Abrí: http://localhost:8000

También se puede desplegar como sitio estático en un servicio de hosting.

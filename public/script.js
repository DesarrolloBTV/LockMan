document.addEventListener('DOMContentLoaded', async () => {
let respuesta = document.getElementById('response')
// Evento para abrir la cerradura
document.getElementById('abrirCerraduraBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/abrir-cerradura', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const data = await response.json();
        respuesta.innerText = (`TX: ${data.enviado}`)
        mostrarRespuesta(data); // Muestra la respuesta en el frontend
    } catch (error) {
        mostrarRespuesta({ success: false, error: `Error en la solicitud: ${error.message}` });
    }
});

// Evento para obtener el estado
document.getElementById('getEstadoBtn').addEventListener('click', async () => {
    try {
        const response = await fetch('/get-estado', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        const data = await response.json();
        respuesta.innerText = (`TX: ${data.enviado}`)
        mostrarRespuesta(data); // Muestra la respuesta en el frontend
    } catch (error) {
        mostrarRespuesta({ success: false, error: `Error en la solicitud: ${error.message}` });
    }
});
})

function mostrarRespuesta(data) {
    const RX = document.getElementById('RX');
    console.log(data.success)
    if (data.success) {
        RX.innerText = `RX: ${data.response}`;
    } else {
        RX.innerText = `Error: ${data.error}`;
    }
}
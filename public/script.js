document.addEventListener('DOMContentLoaded', () => {
    let respuesta = document.getElementById('response');
    let infoComandos = document.getElementById('mensaje-info')
    const comandoInput = document.getElementById('comandoInput')
    const direccionInput = document.getElementById('direccionInput')
    const direccionAntiguaInput = document.getElementById('direccionAnteriorInput')
    const infoDeComandos = {
        '0x30': 'Comando 0x30: Obtener estado puerta.',
        '0x31': 'Comando 0x31: Desbloquear cerradura.',
        '0x32': 'Comando 0x32: Obtener estado del bus completo.',
    };


    // Evento para iniciar el proceso de reclutamiento
    document.getElementById('iniciarReclutamientoBtn').addEventListener('click', async () => {
        respuesta.innerText = (" ");
        try {
            const response = await fetch('/iniciar-reclutamiento', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            respuesta.innerText = (`TX: ${data.enviado}`);
            mostrarRespuesta(data); // Muestra la respuesta en el frontend
        } catch (error) {
            mostrarRespuesta({ success: false, error: `Error en la solicitud: ${error.message}` });
        }
    });

    // Evento para configurar nueva dirección
    document.getElementById('configurarDireccionBtn').addEventListener('click', async () => {
        const nuevaDireccion = direccionInput.value;
        const antiguaDireccion = direccionAntiguaInput.value
        respuesta.innerText = (" ");
        if (!nuevaDireccion) {
            infoComandos.textContent = 'Por favor, ingrese una nueva dirección.';
            return;
        }

        try {
            const response = await fetch('/configurar-nueva-direccion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nuevaDireccion, antiguaDireccion }),
            });
            const data = await response.json();
            respuesta.innerText = (`TX: ${data.enviado}`);
            mostrarRespuesta(data); // Muestra la respuesta en el frontend
        } catch (error) {
            mostrarRespuesta({ success: false, error: `Error en la solicitud: ${error.message}` });
        }
    });

    // Evento para enviar el comando ingresado en el input
    document.getElementById('enviarComandoBtn').addEventListener('click', async () => {
        respuesta.innerText = (" ");
        const comando = comandoInput.value;
        const direccion = direccionInput.value;
        if (!comando && !direccion) {
            infoComandos.textContent = "Faltan valores!"
            return;
        }

        try {
            const response = await fetch('/enviar-comando', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ comando,direccion }), // Enviar comando al backend
            });
            
            const data = await response.json();
            respuesta.innerText = (`TX: ${data.enviado}`);
            mostrarRespuesta(data); // Muestra la respuesta en el frontend
        } catch (error) {
            mostrarRespuesta({ success: false, error: `Error en la solicitud: ${error.message}` });
        }
         
    });
    comandoInput.addEventListener('input', () => {
        const valorIngresado = comandoInput.value;
        if (valorIngresado.length === 4) {
            if (infoDeComandos[valorIngresado]) {
                infoComandos.textContent = infoDeComandos[valorIngresado];
            } else {
                infoComandos.textContent = 'Comando no reconocido.';
            }
        } else {
            infoComandos.textContent = '...';
        }
    }); 
    document.getElementById('detectarCerradurasBtn').addEventListener('click', async() => {
        respuesta.innerText = (" ");
        try {
            const response = await fetch('/detectar-cus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            
            const data = await response.json();
            respuesta.innerText = (`TX: ${data.message}`);
        } catch (error) {
            mostrarRespuesta({ success: false, error: `Error en la solicitud: ${error.message}` });
        }
         
    })
    document.getElementById('inicializacionBtn').addEventListener('click', async() => {
        respuesta.innerText = ("Iniciando proceso...");
        try {
            const response = await fetch('/inicializacion-automatica', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            mostrarRespuesta(data);
            respuesta.innerText = (`TX: ${data.message}`);
        }catch(error){

        }
    })
    // Mostrar la respuesta en la página
    function mostrarRespuesta(data) {
        const RX = document.getElementById('RX');
        if (data.success) {
            RX.innerText = `RX: ${data.response}`;
        } else {
            RX.innerText = `Error: ${data.error}`;
        }
    }
})
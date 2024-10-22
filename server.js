const express = require('express');
const { SerialPort, ReadlineParser } = require('serialport');
const app = express();
const portHttp = 3000;  // Puerto HTTP para Express

// Configuración del puerto RS485
const portSerial = new SerialPort({
    path: 'COM3',  // Cambia 'COM3' por el puerto adecuado en tu sistema Windows
    baudRate: 115200,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
    autoOpen: false
});

// Configuración del parser para leer las respuestas del puerto serial
const parser = portSerial.pipe(new ReadlineParser({ delimiter: '\n' }));

// Variable para almacenar el callback y manejar la respuesta
let responseCallback = null;

// Función para calcular el byte de suma (checksum)
function calcularSuma(comando) {
    return comando.reduce((acc, val) => acc + val, 0) & 0xFF;
}

// Función para construir y enviar el comando
function enviarComando(addr, cmd, callback) {
    const STX = 0x02;  // Start Code
    const ETX = 0x03;  // End Code

    // Construimos el comando (5 bytes): STX, ADDR, CMD, ETX
    let comando = [STX, addr, cmd, ETX];
  
    // Calculamos el byte de suma
    const suma = calcularSuma(comando);
  
    // Agregamos el byte de suma al final del comando
    comando.push(suma);
  
    // Convertimos el comando a un Buffer
    const bufferComando = Buffer.from(comando);

    // Guardamos el callback para manejar la respuesta
    responseCallback = callback;
  
    // Abrimos el puerto si no está abierto
    if (!portSerial.isOpen) {
        portSerial.open(err => {
            if (err) {
                return callback(`Error al abrir el puerto: ${err.message}`);
            }
            console.log('Puerto serial abierto.');
            
            // Enviar comando al abrir el puerto
            portSerial.write(bufferComando, (err) => {
                if (err) {
                    return callback(`Error al enviar el comando: ${err.message}`);
                }
                console.log('Comando enviado:', comando);
            });
        });
    } else {
        // Enviar comando si el puerto ya está abierto
        portSerial.write(bufferComando, (err) => {
            if (err) {
                return callback(`Error al enviar el comando: ${err.message}`);
            }
            console.log('Comando enviado:', comando);
        });
    }
}

// Función para decodificar la respuesta recibida
function decodificarRespuesta(data) {
    const respuesta = Buffer.from(data, 'hex');

    if (respuesta.length === 9 && respuesta[0] === 0x02 && respuesta[7] === 0x03) {
        const addr = respuesta[1];
        const cmd = respuesta[2];
        const status = respuesta.slice(3, 7);  // STATUS son 4 bytes
        const suma = respuesta[8];

        // Verificar si la suma es válida
        if (suma === calcularSuma(respuesta.slice(0, 8))) {
            const puertaAbierta = status[0] === 0x01;
            const ocupado = status[2] === 0x01;
            return `Dirección: ${addr.toString(16)}, Comando: ${cmd.toString(16)}, Puerta Abierta: ${puertaAbierta}, Ocupado: ${ocupado}`;
        } else {
            return "Error: Suma inválida en la respuesta.";
        }
    } else {
        return "Error: Respuesta inválida.";
    }
}

// Leer datos del puerto y decodificarlos
parser.on('data', data => {
    console.log('Respuesta recibida:', data);

    if (responseCallback) {
        const resultado = decodificarRespuesta(data);
        responseCallback(null, resultado);
        responseCallback = null;  // Limpiamos el callback después de procesar la respuesta
    }
});

// Endpoint para abrir la puerta
app.get('/abrir-puerta', (req, res) => {
    const ADDR = 0x01;  // Dirección del locker
    const CMD_OPEN_DOOR = 0x31;  // Comando para abrir la puerta
  
    enviarComando(ADDR, CMD_OPEN_DOOR, (err, mensaje) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.send(mensaje);
    });
});

// Endpoint para obtener el estado de la puerta
app.get('/estado-puerta', (req, res) => {
    const ADDR = 0x01;  // Dirección del locker
    const CMD_GET_STATUS = 0x30;  // Comando para obtener el estado de la puerta

    enviarComando(ADDR, CMD_GET_STATUS, (err, mensaje) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.send(mensaje);
    });
});

// Endpoint para abrir todas las puertas
app.get('/abrir-todas-las-puertas', (req, res) => {
    const CMD_OPEN_DOOR = 0x31;  // Comando para abrir la puerta
    const ADDR_BASE = 0x00;  // Dirección base, locker 0 (ajusta según tu cantidad)

    // Función para enviar comandos secuencialmente
    function abrirPuertasSecuencialmente(addr, callback) {
        if (addr > 0x0F) {  // Suposición: 16 lockers (ajusta según tu cantidad)
            return callback(null, 'Todas las puertas han sido abiertas');
        }
      
        enviarComando(addr, CMD_OPEN_DOOR, (err, mensaje) => {
            if (err) {
                return callback(`Error al abrir la puerta en la dirección ${addr.toString(16)}: ${err}`);
            }
            console.log(`Puerta en la dirección ${addr.toString(16)} abierta`);
            abrirPuertasSecuencialmente(addr + 1, callback);  // Llamada recursiva para la siguiente puerta
        });
    }

    abrirPuertasSecuencialmente(ADDR_BASE, (err, mensajeFinal) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.send(mensajeFinal);
    });
});

// Servir una página HTML para interactuar con los endpoints
app.get('/', (req, res) => {
    res.send(`
        <h1>Control de Locker</h1>
        <button onclick="abrirPuerta()">Abrir Puerta</button>
        <button onclick="estadoPuerta()">Estado de Puerta</button>
        <button onclick="abrirTodasLasPuertas()">Abrir Todas las Puertas</button>
        <div id="resultado"></div>

        <script>
            function abrirPuerta() {
                fetch('/abrir-puerta')
                    .then(response => response.text())
                    .then(data => document.getElementById('resultado').innerText = data);
            }

            function estadoPuerta() {
                fetch('/estado-puerta')
                    .then(response => response.text())
                    .then(data => document.getElementById('resultado').innerText = data);
            }

            function abrirTodasLasPuertas() {
                fetch('/abrir-todas-las-puertas')
                    .then(response => response.text())
                    .then(data => document.getElementById('resultado').innerText = data);
            }
        </script>
    `);
});

// Iniciar el servidor en el puerto 3000
app.listen(portHttp, () => {
    console.log(`Servidor Express escuchando en http://localhost:${portHttp}`);
});

// Cerrar el puerto serial al salir
process.on('SIGINT', () => {
    if (portSerial.isOpen) {
        portSerial.close(err => {
            if (err) {
                console.error('Error al cerrar el puerto serial:', err.message);
            } else {
                console.log('Puerto serial cerrado.');
            }
            process.exit();
        });
    } else {
        process.exit();
    }
});

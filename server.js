const express = require('express');
const { SerialPort } = require('serialport'); // Cambiado aquí
const { ReadlineParser } = require('@serialport/parser-readline'); // Cambiado aquí

// Configurar Express
const app = express();
const PORT = 3000;

// Middleware para analizar el cuerpo de las solicitudes JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Para servir archivos estáticos

// Configura la conexión del puerto serie
const port = new SerialPort({
  path: 'COM3', // Cambia esto a tu puerto COM
  baudRate: 19200, // Asegúrate de que este valor coincida con el de la placa
});

// Crea un parser para leer los datos entrantes
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' })); // Cambiado aquí

// Función para calcular la suma de verificación (checksum)
function calculateChecksum(data) {
  return data.reduce((sum, byte) => sum + byte, 0) & 0xFF; // Sumar bytes y enmascarar con 0xFF
}

// Función para construir el paquete de comandos
function buildCommandPacket(addr, cmd) {
  const STX = 0x02; // Código de inicio
  const ETX = 0x03; // Código de fin
  const packet = [STX, addr, cmd, ETX];
  const checksum = calculateChecksum(packet.slice(0, -1));
  packet.push(checksum);
  return Buffer.from(packet);
}

// Función para manejar los datos entrantes
function handleIncomingData(data) {
  console.log('Received:', data);
  // Aquí podrías enviar la respuesta al cliente si es necesario
}

// Enviar comando a la placa
function sendCommand(addr, cmd) {
  const packet = buildCommandPacket(addr, cmd);
  return new Promise((resolve, reject) => {
    port.write(packet, (err) => {
      if (err) {
        console.error('Error escribiendo en el puerto:', err.message);
        return reject(err);
      }
      console.log('Comando enviado:', packet);
      resolve(packet);
    });
  });
}

// Enviar comando para abrir la cerradura en un puerto específico
function sendUnlockCommand(addr) {
  const command = 0x31;  // Comando para abrir la puerta
  const packet = buildCommandPacket(addr, command); // Aquí se genera el paquete correcto
  return new Promise((resolve, reject) => {
    port.write(packet, (err) => {
      if (err) {
        console.error('Error escribiendo en el puerto:', err.message);
        return reject(err);
      }
      console.log(`Comando enviado para abrir la puerta en placa ${addr}:`, packet);
      resolve(packet);
    });
  });
}

// Escuchar datos entrantes
parser.on('data', handleIncomingData);

// Ruta para abrir la puerta 1 en la placa con dirección 0
app.post('/open-lock', async (req, res) => {
  const addr = 0x00; // Dirección de la placa 0

  try {
    const responsePacket = await sendUnlockCommand(addr); // Envía el comando de apertura
    res.json({ success: true, response: responsePacket });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ruta para enviar comandos
app.post('/send-command', async (req, res) => {
  const { addr, cmd } = req.body;

  try {
    const responsePacket = await sendCommand(addr, cmd);
    res.json({ success: true, response: responsePacket });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ruta para obtener el estado de una sola placa CU
app.post('/get-status', async (req, res) => {
  try {
    const responsePacket = await sendCommand(0x00, 0x30); // Solicitar estado del candado
    res.json({ success: true, response: responsePacket });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Manejar errores al abrir el puerto
port.on('open', () => {
  console.log('Puerto serie abierto');
});

// Manejar errores del puerto
port.on('error', (err) => {
  console.error('Error:', err.message);
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

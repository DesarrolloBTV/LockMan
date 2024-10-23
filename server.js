const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// Configurar Express
const app = express();
const PORT = 3000;
let ultimoDatoRecibido = null; // Variable para almacenar los últimos datos recibidos

// Middleware para analizar el cuerpo de las solicitudes JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configura la conexión del puerto serie
const port = new SerialPort({
  path: 'COM3', // Cambia esto a tu puerto COM
  baudRate: 19200,
});

// Crea un parser para leer los datos entrantes
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

// Función para calcular el checksum
function calcularSUM(data) {
  // Sumar todos los bytes desde STX hasta CMD (sin ETX)
  let sum = data.reduce((total, byte) => total + byte, 0);
  return sum % 256; // Si la suma es mayor que 255, toma solo el resto
}

// Función para construir el paquete de comandos
function crearPaqueteComando(addr, cmd) {
  const STX = 0x02; // Código de inicio
  const ETX = 0x03; // Código de fin

  // Construir el paquete sin incluir ETX
  const packetWithoutETX = [STX, addr, cmd];
  const packetWithETX = [STX, ETX, addr, cmd];

  // Calcular el checksum solo sobre STX, ADDR, CMD
  const checksum = calcularSUM(packetWithETX);

  // Agregar ETX y checksum al paquete
  const packet = [...packetWithoutETX, ETX, checksum];

  return Buffer.from(packet);
}

// Función para esperar la respuesta del puerto serie
function esperarRespuesta() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject('Tiempo de espera agotado para recibir datos.');
    }, 7000); // Esperar un máximo de 5 segundos

    port.on('data', (data) => {
      const receivedData = Array.from(data);
      ultimoDatoRecibido = receivedData.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      clearTimeout(timeout); // Limpia el timeout si se reciben datos
      resolve(ultimoDatoRecibido);
    });
  });
}

// Enviar comando a la placa
function enviarComando(addr, cmd) {
  const packet = crearPaqueteComando(addr, cmd);
  return new Promise((resolve, reject) => {
    port.write(packet, (err) => {
      if (err) {
        console.error('Error escribiendo en el puerto:', err.message);
        return reject(err);
      }
      // Convertir el packet a hexadecimal y agregar un espacio cada dos caracteres
      const hexString = packet.toString('hex').replace(/(.{2})/g, '$1 '); // Añadir espacio
      console.log('Comando enviado:', hexString.trim()); // Trim para quitar el espacio final
      resolve(hexString.trim()); // Devolver el string formateado
    });
  });
}

// Enviar comando para abrir la cerradura en un puerto específico
function abrirCerradura(addr) {
  const command = 0x31;  
  const packet = crearPaqueteComando(addr, command); 
  return new Promise((resolve, reject) => {
    port.write(packet, (err) => {
      if (err) {
        console.error('Error escribiendo en el puerto:', err.message);
        return reject(err);
      }
      const hexString = packet.toString('hex').replace(/(.{2})/g, '$1 '); // Añadir espacio
      console.log('Comando enviado:', hexString.trim()); // Trim para quitar el espacio final
      resolve(hexString.trim()); // Devolver el string formateado
    });
  });
}

// Ruta para abrir la puerta 1 en la placa con dirección 0
app.post('/abrir-cerradura', async (req, res) => {

  try {
    const datosEnviados = await enviarComando(0x00, 0x31);
    const datosRecibidos = await esperarRespuesta(); // Espera la respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado:datosEnviados });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ruta para enviar comandos
app.post('/enviar-comando', async (req, res) => {
  const { addr, cmd } = req.body;

  try {
    const datosEnviados = await enviarComando(addr, cmd);
    const datosRecibidos = await esperarRespuesta(); // Espera la respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado: datosEnviados });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ruta para obtener el estado de una sola placa CU
app.post('/get-estado', async (req, res) => {
  try {
    const comandoEnviado = await enviarComando(0x00, 0x30);
    const datosRecibidos = await esperarRespuesta(); // Espera la respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado: comandoEnviado });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Escuchar datos entrantes
port.on('data', (data) => {
  const receivedData = Array.from(data);
  ultimoDatoRecibido = receivedData.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
  console.log('Datos recibidos:', ultimoDatoRecibido);
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

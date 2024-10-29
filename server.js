/** 
 * 0x30 GET Status CU Board: 02 00 30 03 35
 * 0x31 Unlock lock 1 on CU 0: 02 00 31 03 36
 * 0x32 Status del bus entero, para todas las placas: 02 F0 32 03 27
 * 0x35 Estado puerta
*/


const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Configuración de Winston para el logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new DailyRotateFile({
      filename: 'logs/reclutamiento-%DATE%.log', // Usar %DATE% para crear logs diarios
      datePattern: 'YYYY-MM-DD',       // Formato de la fecha para el nombre del archivo
      maxSize: '20m',                  // Tamaño máximo de cada archivo de log
      maxFiles: '14d'                  // Mantener solo los logs de los últimos 14 días
    })
  ]
});

// Configurar Express
const app = express();
const PORT = 3000;
let ultimoDatoRecibido = null; // Variable para almacenar los últimos datos recibidos
let todasPuertasCerradas = false
// Middleware para analizar el cuerpo de las solicitudes JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configura la conexión del puerto serie
const port = new SerialPort({
  path: 'COM3', // Cambia esto a tu puerto COM
  baudRate: 115200,
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

function crearPaqueteComandoInicializacion(addr, cmd, addrnw) {
  const STX = 0x02; // Código de inicio
  const ETX = 0x03; // Código de fin
  // Inicializar el paquete con STX, dirección, comando y tres ceros adicionales
  const packet = [STX, addr, cmd, addrnw, 0x00, 0x00, 0x00, ETX]; // Agregamos ceros adicionales según la estructura del comando
  // Calcular el checksum sobre el paquete sin incluir ETX
  const checksum = calcularSUM(packet);
  // Agregar ETX y checksum al paquete
  packet.push(checksum); // Agregamos el ETX y el checksum al final

  return Buffer.from(packet); // Convertimos el paquete a un buffer antes de devolverlo
}

// Función para esperar la respuesta del puerto serie
function esperarRespuesta() {
  return new Promise((resolve, reject) => {
    let datosRecibidos = false; // Indicador de si se recibieron datos
    const timeout = setTimeout(() => {
      if (!datosRecibidos) {
        resolve('Sin Respuesta'); // Retorna "Sin Respuesta" si no se recibieron datos
      }
    }, 1000);

    port.on('data', (data) => {
      datosRecibidos = true; // Indica que se han recibido datos
      const receivedData = Array.from(data);
      const ultimoDatoRecibido = receivedData.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      clearTimeout(timeout); // Limpia el timeout si se reciben datos
      resolve(ultimoDatoRecibido);
    });
  });
}
function esperarMultiplesRespuestas() {
  return new Promise((resolve, reject) => {
    let datosRecibidos = false; // Indicador de si se recibieron datos
    const respuestas = []; // Arreglo para almacenar múltiples respuestas
    const timeout = setTimeout(() => {
      if (!datosRecibidos) {
        resolve('Sin Respuesta'); // Retorna "Sin Respuesta" si no se recibieron datos
      } else {
        resolve(respuestas.join('\n')); // Devuelve todas las respuestas recibidas
      }
    }, 10000); // Esperar un máximo de 10 segundos para todas las respuestas

    port.on('data', (data) => {
      datosRecibidos = true; // Indica que se han recibido datos
      const receivedData = Array.from(data);
      const respuestaFormateada = receivedData.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      respuestas.push(respuestaFormateada); // Almacena cada respuesta en el array
    });
  });
}

// Enviar comando a la placa
function enviarComando(addr, cmd, addrnw) {
  let packet;
  const addrHex = parseInt(addr, 10); // Convertir a número si no lo es
  console.log(addrHex)
  if(cmd == "0x80" || cmd == "0x81"){
    packet = crearPaqueteComandoInicializacion(addrHex, cmd, addrnw);

  }else{
    packet = crearPaqueteComando(addrHex, cmd);
  }
  return new Promise((resolve, reject) => {
    port.write(packet, (err) => {
      if (err) {
        //console.error('Error escribiendo en el puerto:', err.message);
        logger.info('Error escribiendo en el puerto:', err.message);

        return reject(err);
      }
      // Convertir el packet a hexadecimal y agregar un espacio cada dos caracteres
      const hexString = packet.toString('hex').replace(/(.{2})/g, '$1 '); // Añadir espacio
      console.log('Comando enviado:', hexString.trim()); // Trim para quitar el espacio final

      resolve(hexString.trim()); // Devolver el string formateado
    });
  });
}

// Ruta para abrir la puerta 1 en la placa con dirección 0
app.post('/abrir-cerradura', async (req, res) => {

  try {
    const datosEnviados = await enviarComando(0x10, 0x31, 0x00);//
    const datosRecibidos = await esperarRespuesta(); // Espera la respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado:datosEnviados });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/enviar-comando', async (req, res) => {
  let { comando,direccion } = req.body;
  // Si el comando viene como string hexadecimal, conviértelo a número
  if (comando.startsWith('0x')) {
      comando = parseInt(comando, 16); // Convertir el comando ingresado de string a hexadecimal
  }
  if (direccion.startsWith('0x')) {
    direccion = parseInt(direccion, 16); // Convertir el comando ingresado de string a hexadecimal
}
  try {
      const datosEnviados = await enviarComando(direccion, comando,0x00); // Enviar el comando ingresado
      const datosRecibidos = await esperarMultiplesRespuestas(); // Esperar respuesta del puerto serie

      res.json({ success: true, response: datosRecibidos, enviado: datosEnviados });
  } catch (error) {
      res.json({ success: false, error: error.message });
  }
});

// Ruta para obtener el estado de una sola placa CU
app.post('/get-estado', async (req, res) => {
  try {
    const comandoEnviado = await enviarComando(0x00, 0x30,0x00);
    const datosRecibidos = await esperarRespuesta(); // Espera la respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado: comandoEnviado });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ruta para obtener el estado de una sola placa CU
app.post('/get-estado-bus', async (req, res) => {
  try {
    const comandoEnviado = await enviarComando(0xf0, 0x32, 0x00); // Envía el comando para el estado del bus completo
    const datosRecibidos = await esperarMultiplesRespuestas(); // Espera múltiples respuestas
    res.json({ success: true, response: datosRecibidos, enviado: comandoEnviado });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/iniciar-reclutamiento', async (req, res) => {
  try {
    const comandoEnviado = await enviarComando(0xFF, 0x80, 0x00); // Usar dirección 0xFF como broadcast
    const datosRecibidos = await esperarRespuesta(); // Esperar respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado: comandoEnviado });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ejemplo para manejar el comando 0x81 (configurar nueva dirección)
app.post('/configurar-nueva-direccion', async (req, res) => {
  const { nuevaDireccion, antiguaDireccion } = req.body;

  if (!nuevaDireccion) {
    return res.status(400).json({ success: false, error: 'Falta la nueva dirección' });
  }
  const direccionAntigua = parseInt(antiguaDireccion)
  const direccionNueva = parseInt(nuevaDireccion)
  try {
    const comandoEnviado = await enviarComando(direccionAntigua, 0x81, direccionNueva);
    const datosRecibidos = await esperarRespuesta(); // Esperar respuesta del puerto
    res.json({ success: true, response: datosRecibidos, enviado: comandoEnviado });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/inicializacion-automatica', async (req, res) => {
  try {
    // 1. Iniciar el proceso de reclutamiento
    const comandoEnviado = await enviarComando(0xFF, 0x80, 0x00); // Usar dirección 0xFF como broadcast
    logger.info("Proceso de reclutamiento iniciado, todas las puertas abiertas.");
    await delay(2000);

    const cerradurasAsignadas = [];
    let timeoutGlobal = 30000; // 20 segundos de tiempo límite global para finalizar el proceso si no se detecta el cierre de puertas
    let tiempoInicioProceso = Date.now(); // Tiempo de inicio del proceso
    let procesoTerminado = false;

    // 2. Iniciar el bucle para verificar el estado de las cerraduras
    while (cerradurasAsignadas.length < 254 && !procesoTerminado) { // Hasta un máximo de 254 cerraduras

      let puertaCerradaDetectada = false; // Esta variable se usará para detectar si se cierra una puerta

      // 4. Verificar el estado de cada cerradura no asignada
      for (let i = 0; i < 254 && !procesoTerminado; i++) { 
        // Solo verificar cerraduras que no hayan sido asignadas
        if (!cerradurasAsignadas.includes(i)) {
          let tiempoInicioVerificacion = Date.now(); // Tiempo para cada cerradura individual

          // 5. Verificar el estado de una cerradura hasta que se cierre o se alcance el timeout global
          while (!puertaCerradaDetectada && !procesoTerminado) {
            // Verificar si se ha excedido el tiempo límite global
            if (Date.now() - tiempoInicioProceso > timeoutGlobal) {
              logger.warn(`Tiempo global de espera superado, finalizando proceso.`);
              //await reiniciarPuertoSerie()
              procesoTerminado = true;
              break;
            }

            // 6. Enviar comando para obtener el estado de la cerradura
            const estadoPuerta = await enviarComando(0x00, 0x30); // Enviar comando para obtener el estado
            const respuestaEstado = await esperarRespuesta();
            const estadoHexArray = respuestaEstado.trim().split(' '); // Convertir la respuesta en un array
            logger.info(`Verificando cerradura 0x00, respuesta: ${respuestaEstado}`);

            // 7. Verificar si la cerradura está cerrada (el cuarto byte debe ser '01')
            if (estadoHexArray[3] === '00') {
              puertaCerradaDetectada = true;
              await delay(200);
              tiempoInicioProceso = Date.now();  // Reiniciar el contador global
              const direccionActual = cerradurasAsignadas.length + 1; // Dirección a asignar
              // 8. Enviar comando para establecer nueva dirección
              let comandoEnviado = await enviarComando(i, 0x81, direccionActual); // Asignar la nueva dirección
              cerradurasAsignadas.push(direccionActual); // Guardar la dirección de la cerradura asignada
              logger.info(`Cerradura en dirección 0x00 asignada a 0x${direccionActual.toString(16).padStart(2, '0')}`);
              await delay(200)
              await enviarComando(direccionActual, 0x31); 
              console.log(`Abriendo puerta asignada 0x${direccionActual.toString(16).padStart(2,'0')}`)
              logger.info(`Abriendo puerta asignada 0x${direccionActual.toString(16).padStart(2,'0')}`);
              break; // Salir de la espera por esta cerradura
            } else {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar un segundo antes de verificar nuevamente
            }
          }
        }
      }
    }
    while(!todasPuertasCerradas){
      await delay(1000)
      for (const direccion of cerradurasAsignadas) {
        const estadoPuerta = await enviarComando(direccion, 0x30); // Enviar comando para obtener el estado
        const respuestaEstado = await esperarRespuesta();
        const estadoHexArray = respuestaEstado.trim().split(' '); // Convertir la respuesta en un array
        if(estadoHexArray[3] === '01'){
          todasPuertasCerradas = false
          logger.info(`La puerta en dirección 0x${direccion.toString(16).padStart(2, '0')} no está cerrada.`);
          break
        }else{
          todasPuertasCerradas = true
        }
      }
      
      if(todasPuertasCerradas){
        logger.info("Todas las puertas estan cerradas. Iniciando apertura...");
        await delay(5000)
        for(const direccion of cerradurasAsignadas){
          await enviarComando(direccion, 0x31); // Comando de apertura
          logger.info(`Puerta en dirección 0x${direccion.toString(16).padStart(2, '0')} abierta.`);
          await delay(500); // Retraso de 500 ms entre cada apertura
        }
      }else{
        logger.info("No todas las puertas estan cerradas");

      }
    }
    // Verifica si el proceso terminó por timeout o por completarse normalmente
    if (procesoTerminado) {
      res.json({ success: true, message: 'Proceso de reclutamiento finalizado por timeout', cerraduras: cerradurasAsignadas });
      logger.info("Proceso de reclutamiento finalizado");
    } else {
      res.json({ success: true, message: 'Proceso de reclutamiento completado', cerraduras: cerradurasAsignadas });
    }
  } catch (error) {
    logger.error(`Error en el proceso de reclutamiento: ${error.message}`);
    res.json({ success: false, error: error.message });
  }
});

app.post('/detectar-cus', async (req, res) => {

  let cerraduras = await detectarPlacasConectadas()
  res.json({ success: true, message: `CUs detectadas:${cerraduras}`});

})

async function detectarPlacasConectadas() {
  const direccionComando = 0xF0;
  const comandoPlacas = 0x32;
  let placasConectadas = [];

  try {
    // 1. Enviar el comando para detectar placas CU conectadas
    await enviarComando(direccionComando, comandoPlacas, 0x00);

    let seguirEsperando = true;

    // 2. Comenzamos a recibir respuestas hasta que no haya más respuestas válidas
    while (seguirEsperando) {
      try {
        const respuesta = await esperarRespuesta(); // Ejemplo: "02 00 36 00 00 00 00 03 3b\n02 10 36 00 00 00 00 03 4b"
        // Manejo de respuesta "Sin Respuesta"
        if (respuesta === "Sin Respuesta") {
          seguirEsperando = false; // Detener el bucle si se recibe "Sin Respuesta"
          break; // Continuar al siguiente ciclo del bucle
        }
        if (respuesta) {
          // Separar las respuestas en base a nuevas líneas
          const respuestasArray = respuesta.trim().split('\n');
          // Procesar cada respuesta individualmente
          respuestasArray.forEach(res => {
            const respuestaHexArray = res.trim().split(' ');
            // Validamos si la respuesta tiene al menos 8 bytes (longitud mínima esperada)
            
            if (respuestaHexArray.length >= 8) {
              const direccionPlaca = respuestaHexArray[1]; // El segundo byte es la dirección de la placa CU
              // Comprobamos si esta dirección ya está registrada
              if (!placasConectadas.includes(direccionPlaca)) {
                placasConectadas.push(direccionPlaca); // Añadir la dirección de la placa detectada
                console.log(`Placa CU detectada en dirección: 0x${direccionPlaca.toString(16).padStart(2, '0')}`);
              }
            }
          });
        } else {
          // Si no hay más respuestas, detener la detección
          seguirEsperando = false;
        }
      } catch (error) {
        console.log("Error al intentar obtener respuesta de la placa CU:", error.message);
        seguirEsperando = false; // Si hay un error en la respuesta, paramos el bucle
      }
    }
    return placasConectadas
  } catch (error) {
    console.log("Error al enviar el comando para detectar placas CU:", error.message);
    return [];
  }
}

// Función para reiniciar la conexión del puerto serie
async function reiniciarPuertoSerie() {
  try {
    console.log("Cerrando el puerto serie...");
    port.close(); // Cierra el puerto
    console.log("Puerto cerrado.");

    // Esperar un poco antes de volver a abrir
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Abriendo el puerto serie nuevamente...");
    port.open(); // Vuelve a abrir el puerto
    console.log("Puerto abierto.");
  } catch (error) {
    console.error("Error al reiniciar el puerto serie:", error);
  }
}

async function delay(ms) {
  return new Promise((resolve) => {
      setTimeout(resolve, ms);
  });
}

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

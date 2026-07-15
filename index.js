const express = require('express');
require('dotenv').config()
const cors= require("cors");
const { dbConeccion } = require('./db/DB_Config');
const app= express();


//llamar al servidor
app.listen(process.env.PORT, ()=>{
    console.log(`server corriendo en ${process.env.PORT}`)
})

//base de datos
dbConeccion();

/*

const cron = require('node-cron');
const { controlarEstadoCuotas } = require('./services/controlCuotas');

// Ejecutar todos los días a las 00:01 AM (hora Argentina)
// 0 1 * * * = 01:00 UTC = 22:00 ARG (-3) 
// 3 0 * * * = 00:03 UTC = 21:03 ARG (-3) del día anterior
// Para que sea 00:01 ARG: 0 3 * * *

cron.schedule('0 3 * * *', async () => {
    console.log('🚀 Ejecutando control automático de cuotas...');
    await controlarEstadoCuotas();
}, {
    scheduled: true,
    timezone: "America/Argentina/Buenos_Aires"
});

console.log('⏰ Cron job programado: Control de cuotas todos los días a las 00:01 AM');

*/

//cors
app.use(cors());

//directorio publico
app.use(express.static('public'));

//lectura y parseo del body
app.use(express.json());

//midelwars son procesos que se van a correr durante la ejecucion
app.use("/auth",require('./Rutes/Auth'))

//para el admin
app.use("/admin",require('./Rutes/Admin'))

//para asesores y vendedores solamente cobranza
app.use("/vtas",require('./Rutes/Ventas'))

//para cobranza solamente 
app.use("/cobranza",require('./Rutes/Cobranza'))

//para los reportes del ceo
app.use("/rep_ceo",require('./Rutes/Reportes'))
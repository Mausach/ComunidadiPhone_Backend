const express = require('express');
require('dotenv').config()
const cors= require("cors");
const { dbConeccion } = require('./DB/DB_Config');
const app= express();


//llamar al servidor
app.listen(process.env.PORT, ()=>{
    console.log(`server corriendo en ${process.env.PORT}`)
})

//base de datos
dbConeccion();

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
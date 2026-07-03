const mongoose = require('mongoose');


const dbConeccion = async () => {

    try {

        await mongoose.connect(process.env.DB_CNN);
        console.log('db conectado');

    } catch (error) {
        console.log(error)
        throw new Error("error a la hs de iniciar Base de Datos")
    }
}


module.exports = {
    dbConeccion
}
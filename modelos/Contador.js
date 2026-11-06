const { Schema, model } = require('mongoose');

const contadorSchema = new Schema({
    _id: { type: String, required: true }, // Acá guardaremos la palabra 'contrato'
    secuencia: { type: Number, default: 0 } // El número actual
});

module.exports = model('Contador', contadorSchema);
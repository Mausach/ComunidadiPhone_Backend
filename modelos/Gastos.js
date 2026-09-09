const { Schema, model } = require('mongoose');

const gastoSchema = new Schema({
    descripcion_gasto: {
        type: String,
        required: true,
        trim: true
    },
    Monto_gasto: {
        type: Number,
        required: true
    },
    fecha: {
        type: Date,
        required: true
    },
      responsable: {
        type: String,
        required: true,
        trim: true
    },
}, {
    timestamps: true // Si quieres que tenga createdAt y updatedAt automáticamente
});

module.exports = model('Gasto', gastoSchema);
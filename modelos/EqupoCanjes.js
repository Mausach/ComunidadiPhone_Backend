const { Schema, model } = require('mongoose');

const equipoCanjeSchema = new Schema({
    ventaOrigen: {
        type: Schema.Types.ObjectId,
        ref: 'Venta',
        required: true
    },
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    modelo: {
        type: String,
        trim: true
    },
    imei: {
        type: String,
        trim: true,
        unique: true,
        sparse: true
    },
    color: {
        type: String,
        trim: true
    },
    bateria: {
        type: String,
        trim: true
    },
    estado: {
        type: String,
        enum: ['bueno', 'regular', 'malo', 'excelente'],
        default: 'bueno'
    },
    valorTasado: {
        type: Number,
        required: true,
        min: 0
    },
    fechaRecepcion: {
        type: Date,
        default: Date.now
    },
    notas: [{
        texto: String,
        fecha: {
            type: Date,
            default: Date.now
        },
        usuario: {
            nombre: String
        }
    }],
    activo: { //activo seria disponible falso seria que no lo esta
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = model('EquipoCanje', equipoCanjeSchema);
const { Schema, model } = require('mongoose');

const stockSchema = new Schema({
    // ==========================================
    // DATOS DEL EQUIPO
    // ==========================================
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
    
    // ==========================================
    // ESTADO DEL EQUIPO
    // ==========================================
    estado: {
        type: String,
        enum: ['nuevo', 'sellado', 'semi nuevo', 'reacondicionado', 'exhibicion'],
        default: 'sellado'
    },
    
    // ==========================================
    // PRECIOS
    // ==========================================
    precioCompra: {
        type: Number,
        required: true,
        min: 0
    },
    precioVenta: {
        type: Number,
        required: true,
        min: 0
    },
    
    // ==========================================
    // PROVEEDOR (opcional)
    // ==========================================
    proveedor: {
        nombre: String,
        telefono: String,
        email: String,
        factura: String  // Número de factura
    },
    
    // ==========================================
    // FECHAS
    // ==========================================
    fechaIngreso: {
        type: Date,
        default: Date.now
    },
    fechaVenta: {
        type: Date,
        default: null
    },
    
    // ==========================================
    // ESTADO DE DISPONIBILIDAD
    // ==========================================
    disponible: {
        type: Boolean,
        default: true
    },
    
    // ==========================================
    // REFERENCIA A VENTA (si se vendió)
    // ==========================================
    ventaAsociada: {
        type: Schema.Types.ObjectId,
        ref: 'Venta',
        default: null
    },
    
    // ==========================================
    // NOTAS
    // ==========================================
    notas: [{
        texto: {
            type: String,
            required: true
        },
        fecha: {
            type: Date,
            default: Date.now
        },
        usuario: {
            nombre: String
        },
        tipo: {
            type: String,
            enum: ['general', 'importante', 'mantenimiento', 'reparacion'],
            default: 'general'
        }
    }]
}, {
    timestamps: true
});

module.exports = model('Stock', stockSchema);
const { Schema, model } = require('mongoose');

const equipoSchema = new Schema({
    // ==========================================
    // ORIGEN DEL EQUIPO (diferenciador)
    // ==========================================
    origen: {
        type: String,
        enum: ['stock', 'canje'],
        required: true,
        index: true
    },

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
    capacidad: {
        type: String,
        trim: true,
        default: ''
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
    // LOCALIDAD/DESTINO
    // ==========================================
    localidad: {
        type: String,
        trim: true,
        lowercase: true
    },
    
    // ==========================================
    // ESTADO DEL EQUIPO
    // ==========================================
    estado: {
        type: String,
        enum: ['sellado', 'semi nuevo', 'reacondicionado', 'exhibicion', 'bueno', 'regular', 'malo'],
        default: 'sellado'
    },
    
    // ==========================================
    // PRECIOS (para stock)
    // ==========================================
    precioCompra: {
        type: Number,
        min: 0,
        default: 0
    },
    precioVenta: {
        type: Number,
        min: 0,
        default: 0
    },
    
    // ==========================================
    // VALOR TASADO (para canje)
    // ==========================================
    valorTasado: {
        type: Number,
        min: 0,
        default: 0
    },
    
    // ==========================================
    // PROVEEDOR (opcional, para stock)
    // ==========================================
    proveedor: {
        nombre: String,
        telefono: String,
        email: String,
        factura: String
    },
    
    // ==========================================
    // FECHAS
    // ==========================================
    fechaIngreso: {
        type: Date,
        default: Date.now
    },
    fechaRecepcion: {
        type: Date,
        default: null
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
    // REFERENCIA A VENTA ORIGEN (solo canje)
    // ==========================================
    ventaOrigen: {
        type: Schema.Types.ObjectId,
        ref: 'Venta',
        default: null
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

// ==========================================
// ÍNDICES
// ==========================================
equipoSchema.index({ origen: 1, disponible: 1 });
equipoSchema.index({ localidad: 1 });
equipoSchema.index({ estado: 1 });
equipoSchema.index({ nombre: 1 });

// ==========================================
// EXPORTACIÓN
// ==========================================
module.exports = model('Equipo', equipoSchema);
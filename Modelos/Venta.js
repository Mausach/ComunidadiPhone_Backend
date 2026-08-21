const { Schema, model } = require('mongoose');

const ventaSchema = new Schema({

    // ==========================================
    // CLIENTE (datos embebidos para reportes)
    // ==========================================
    cliente: {
        nombre: String,
        apellido: String,
        dni: String,
        telefono: String,
        email: String,
        direccion: String,
    },

    // ==========================================
    // Localidad para mejorar reportes
    // ==========================================
    localidad: {
        type: String,
        required: [true, 'La localidad es obligatoria'],
        lowercase: true,
        trim: true
    },

    // ==========================================
    // TIPO DE VENTA (flexible, no enum rígido)
    // ==========================================
    tipoVenta: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    // ==========================================
    // FECHAS
    // ==========================================
    fechaRealizada: {
        type: Date,
        required: true,
        default: Date.now
    },

    // ==========================================
    // VENDEDOR (simple string, sin referencia)
    // ==========================================
    vendedor: {
        type: String,
    },

    // ==========================================
    // PRODUCTO / Equipo
    // ==========================================
    producto: {
        nombre: {
            type: String,
            required: true,
            trim: true
        },
        modelo: {
            type: String,
            trim: true
        },
        bateria: {
            type: String,
            trim: true
        },
        color: {
            type: String,
            trim: true
        },
        imei: {
            type: String,
            trim: true,
            unique: true,
            sparse: true
        },
        estado: {
            type: String,
            enum: ['sellado', 'semi nuevo', 'reacondicionado', 'exhibicion', 'bueno', 'regular', 'malo'],
            default: 'sellado'
        },
        valor: {
            type: Number,
            required: true,
            min: 0
        },
    },

    // ==========================================
    // GARANTE (solo para ventas financiadas)
    // ==========================================
    requiereGarante: {
        type: Boolean,
        default: false
    },
    garante: {
        nombre: String,
        apellido: String,
        dni: String,
        cuil: String,
        telefono: String,
        telefono2: String,
        email: String,
        direccion: String,
    },

    // ==========================================
    // PAGOS RECIBIDOS (array para múltiples métodos)
    // ==========================================
    pagos: [{
        monto: {
            type: Number,
            required: true,
            min: 0
        },
        metodo: {
            type: String,
            required: true,
            trim: true
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
        fecha: {
            type: Date,
            default: Date.now
        },
    }],

    // ==========================================
    // MONTOS TOTALES (calculados)
    // ==========================================
    montoTotal: {
        type: Number,
        required: true,
        min: 0
    },
    montoPagado: {
        type: Number,
        default: 0
    },

    // ==========================================
    // NOTAS GENERALES DE LA VENTA
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
        tipo: {
            type: String,
            enum: ['general', 'importante', 'seguimiento', 'cobranza'],
            default: 'general'
        },
        usuario: {
            id: {
                type: Schema.Types.ObjectId,
                ref: 'Usuario'
            },
            nombre: String
        }
    }],

    // ==========================================
    // CUOTAS
    // ==========================================
    frecuenciaCuota: {
        type: String,
        enum: ['diario', 'semanal', 'quincenal', 'mensual'],
        default: null
    },

    cuotas: [{
        numeroCuota: Number,
        
        // Monto original de la cuota (NUNCA se modifica)
        montoCuota: Number,
        
        // Monto realmente pagado (para pagos parciales)
        montoPagado: {
            type: Number,
            default: 0
        },
        
        // 👉 NUEVO: Array de recargos por atraso/mora (HISTÓRICO)
        recargos: [{
            monto: {
                type: Number,
                required: true,
                min: 0
            },
            motivo: {
                type: String,
                required: true,
                trim: true
            },
            fecha: {
                type: Date,
                default: Date.now,
                required: true
            },
            // Días de atraso que generaron este recargo (para auditoría)
            diasAtraso: {
                type: Number,
                default: 0
            },
            // Porcentaje aplicado (si es porcentaje)
            porcentajeAplicado: {
                type: Number,
                default: 0
            },
            usuario: {
                nombre: {
                    type: String,
                    required: true
                }
            }
        }],
        
        // ⚠️ Campo calculado: total de recargos acumulados
        // NO se guarda en BD, se calcula con un virtual o en el frontend
        
        metodoPago: String,
        
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
        
        fechaCobro: Date,
        
        estado_cuota: {
            type: String,
            enum: ["pagada", "pendiente", "pago parcial", "no pagada"]
        },
        
        fechaCobrada: Date,
        
        cobrador: {
            nombre: String
        }
    }],

    // ==========================================
    // ESTADO GENERAL
    // ==========================================
    conducta_pago: {
        type: String,
        enum: ["al dia", "cancelado", "refinanciado", "atrasado", "cobro judicial", "caducado"],
        default: 'al dia',
    },

    // ==========================================
    // METADATA
    // ==========================================
    estado: {
        type: Boolean,
        default: true
    }
});


// ==========================================
// EXPORTACIÓN
// ==========================================
module.exports = model('Venta', ventaSchema);
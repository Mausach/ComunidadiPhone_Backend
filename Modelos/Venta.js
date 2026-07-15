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
    localidad: { //cambiarla a venta para facilitar filtrado
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
        // Ejemplos: 'contado', 'financiado', 'permuta', 'plan_ahorro', etc.
        // Se puede agregar cualquier tipo nuevo sin modificar el modelo
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
            trim: true  // Ej: "Samsung Galaxy S24 Ultra"
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
            sparse: true  // Permite null sin conflicto
        },
        estado: {
            type: String,
            enum: ['sellado', 'semi nuevo', 'reacondicionado', 'exhibicion'],
            default: 'sellado'
        },
        valor: {
            type: Number,
            required: true,
            min: 0  // Precio de venta
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
        metodo: { //metodo principal de pago
            type: String,
            required: true,
            trim: true
            // Ej: 'efectivo', 'transferencia', 'cripto', 'dolares', etc.
        },

        // ❌ No tenés forma de registrar: PODRIA AGREGARSE A FUTURO
        // - Si pagó en dólares o crypto
        // - La cotización del día
        // - El valor convertido a pesos
        // Ejemplo real: "Pagó US$50 en USDT a cotización $1.200 = $60.000 ARS"

        notas: [{ //aqui se aclara si se abono en otras monedas y como se abono eso
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
        min: 0  // Valor total de la venta
    },
    montoPagado: { //A EVALUAR SI HACE FALTA
        type: Number,
        default: 0  // Se actualiza con cada pago
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
    // CUOTAS (para ventas plan canje sistema 1 y sistema 2)
    // ==========================================

    frecuenciaCuota: {
    type: String,
    enum: ['diario', 'semanal', 'quincenal', 'mensual'],
    default: null  // 👈 null = no tiene cuotas
},

    cuotas: [{
        numeroCuota: Number,
        montoCuota: Number,
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
            //-(cuando paga algo o se atrasa pero si paga)-(cuando no quiere pagar)(es base comoa rrancan todas las cuotas)
            enum: ["pagada", "pendiente","pago parcial", "no pagada"]
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
        //'activo', 'cancelado',                     'moroso', 'judicial', 'incobrable'
        enum: ["al dia", "cancelado", "refinanciado", "atrasado", "cobro judicial", "caducado"],
        default: 'al dia',

    },

    // ==========================================
    // METADATA
    // ==========================================
    estado: {
        type: Boolean,
        default: true  // Soft delete
    }
},
);

// ==========================================
// EXPORTACIÓN
// ==========================================
module.exports = model('Venta', ventaSchema);
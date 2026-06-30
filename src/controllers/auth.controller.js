import User from "../models/user.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const avatarColors = ["#2a8b7b", "#2563eb", "#7c3aed", "#dc2626", "#ea580c", "#475569", "#111827"];
const normalizeAvatarColor = (value) => avatarColors.includes(value) ? value : avatarColors[0];
const userPayload = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    avatarColor: normalizeAvatarColor(user.avatarColor)
});

export async function register(req, res) {
    try{
        const {name, email, password} = req.body;

        if(!name || !email || !password)
            return res.status(400).json({ok: false, message: 'Todos los campos son obligatorios'});

        const exist= await User.findOne({email});
        if(exist) return res.status(409).json({ok: false, message: 'El usuario ya esta registrado'});

        const hash = await bcrypt.hash(password, 10);
        const user = new User({name, email, password: hash});
        await user.save();

        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET, {expiresIn: '1d'});
        res.status(201).json({token, user: userPayload(user)});
    } catch(e){
        res.status(500).json({ok: false, message: 'Error en el servidor', error: e.message});
    }
}

export async function login(req, res) {
    try{

        const {email, password} = req.body;
        const user = await User.findOne({email});
        if(!user) return res.status(401).json({ message: 'Email o constraseña incorrecta'});

        const ok = await bcrypt.compare(password, user.password);
        if(!ok) return res.status(401).json({ message: 'Email o constraseña incorrecta'});

        const token = jwt.sign({id: user._id}, process.env.JWT_SECRET || 'changeme',{expiresIn: '1d'});
        res.json({token, user: userPayload(user)});
        
    } catch(e){
        res.status(500).json({message: 'Error del servidor no jala, ni lo intentes madafaker'});
    }

}

export async function me(req, res) {
    try {
        const user = await User.findById(req.userId).select("_id name email avatarColor");
        if (!user) return res.status(404).json({message: "Usuario no encontrado"});

        res.json({user: userPayload(user)});
    } catch {
        res.status(500).json({message: "Error al obtener perfil"});
    }
}

export async function updateProfile(req, res) {
    try {
        const {name, email, password, avatarColor} = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({message: "Usuario no encontrado"});

        const nextName = typeof name === "string" ? name.trim() : "";
        const nextEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

        if (!nextName || !nextEmail) {
            return res.status(400).json({message: "Nombre y correo son obligatorios"});
        }

        const exist = await User.findOne({email: nextEmail, _id: {$ne: user._id}});
        if (exist) return res.status(409).json({message: "Ese correo ya está registrado"});

        user.name = nextName;
        user.email = nextEmail;
        user.avatarColor = normalizeAvatarColor(avatarColor || user.avatarColor);

        if (typeof password === "string" && password.trim()) {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();
        res.json({user: userPayload(user)});
    } catch (e) {
        res.status(500).json({message: "Error al actualizar perfil", error: e.message});
    }
}

import User from "../models/user.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

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
        res.status(201).json({token, user:{id: user._id, name: user.name, email: user.email}});
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
        res.json({token, user:{id: user._id, name: user.name, email: user.email}});
        
    } catch(e){
        res.status(500).json({message: 'Error del servidor no jala, ni lo intentes madafaker'});
    }

}
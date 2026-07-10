import jwt from 'jsonwebtoken';

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET || 'changeme');
}

export function auth (req, res, next){
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer') ? header.slice(7) : null;
    if (!token) return res.status(401).json({message:'Token Requerido'});
    try{
        const payload = verifyToken(token);
        req.userId = payload.id;
        next();
    }catch(e){
        return res.status(401).json({message:'Token Invalido'});
    }
}

export function authFromQuery(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer') ? header.slice(7) : req.query.token;
    if (!token || Array.isArray(token)) return res.status(401).json({message:'Token Requerido'});
    try{
        const payload = verifyToken(token);
        req.userId = payload.id;
        next();
    }catch(e){
        return res.status(401).json({message:'Token Invalido'});
    }
}

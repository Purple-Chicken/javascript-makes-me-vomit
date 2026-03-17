import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.ts';
import dotenv from 'dotenv';

dotenv.config(); 

export function configurePassport() {
  passport.use(new LocalStrategy(async (username, password, done) => {
    try {
      const user = await User.findOne({ username });
      if (!user) return done(null, false, { message: 'Incorrect username.' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return done(null, false, { message: 'Incorrect password.' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  // 2. JWT Strategy: For protecting subsequent RESTful requests
passport.use(new JwtStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'LOL' 
  }, async (jwtPayload, done) => {
    try {
      const user = await User.findById(jwtPayload.id);
      return user ? done(null, user) : done(null, false);
    } catch (err) {
      return done(err, false);
    }
  }));

}

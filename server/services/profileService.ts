import db from "../database/db.js";

export const profileService = {
  getProfiles() {
    return db.prepare("SELECT * FROM profiles").all();
  },

  getProfile(username: string) {
    const row = db.prepare("SELECT * FROM profiles WHERE username = ?").get(username);
    return row || { username, nickname: username, profilePic: null, bio: null };
  },

  updateProfile(username: string, data: any) {
    const { nickname, profilePic, bio, mood, focus } = data;
    
    if (mood !== undefined) {
      db.prepare("UPDATE profiles SET mood = ?, mood_timestamp = CURRENT_TIMESTAMP WHERE username = ?").run(mood, username);
    }

    if (focus !== undefined) {
      db.prepare("UPDATE profiles SET focus = ?, focus_timestamp = CURRENT_TIMESTAMP WHERE username = ?").run(focus, username);
    }
    
    if (nickname !== undefined || profilePic !== undefined || bio !== undefined) {
      const current = db.prepare("SELECT * FROM profiles WHERE username = ?").get(username) as any;
      const finalNickname = nickname !== undefined ? nickname : current?.nickname;
      const finalProfilePic = profilePic !== undefined ? profilePic : current?.profilePic;
      const finalBio = bio !== undefined ? bio : current?.bio;
      
      db.prepare("INSERT OR REPLACE INTO profiles (username, nickname, profilePic, bio, mood, mood_timestamp, focus, focus_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(username, finalNickname, finalProfilePic, finalBio, current?.mood || 'Happy', current?.mood_timestamp || new Date().toISOString(), current?.focus || 'Available', current?.focus_timestamp || new Date().toISOString());
    }
    
    return db.prepare("SELECT * FROM profiles WHERE username = ?").get(username);
  }
};

import { Router } from "express";
import { profileService } from "../services/profileService.js";
import { asyncWrapper } from "../middleware/errorHandler.js";
import { validate, authenticate, requireSelf } from "../middleware/auth.js";

const router = Router();

router.get("/", asyncWrapper(async (req: any, res: any) => {
  const profiles = profileService.getProfiles();
  res.json(profiles);
}));

router.get("/:username", asyncWrapper(async (req: any, res: any) => {
  const { username } = req.params;
  const profile = profileService.getProfile(username);
  res.json(profile);
}));

router.post("/:username", 
  authenticate,
  requireSelf("username"),
  validate({
    nickname: { type: "string", required: false },
    profilePic: { type: "string", required: false },
    bio: { type: "string", required: false },
    mood: { type: "string", required: false }
  }),
  asyncWrapper(async (req: any, res: any) => {
    const { username } = req.params;
    const updated = profileService.updateProfile(username, req.body);
    res.json(updated);
  })
);

export default router;

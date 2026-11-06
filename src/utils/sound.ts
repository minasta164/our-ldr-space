export const playCuteSound = (type: "pop" | "bubble" | "sparkle" | "meow" = "pop") => {
  const cuteSounds = {
    pop: "https://cdn.pixabay.com/audio/2022/03/15/audio_78390a5c02.mp3", // Cute blip
    bubble: "https://cdn.pixabay.com/audio/2022/03/10/audio_c35078173b.mp3", // Soft bubble
    sparkle: "https://cdn.pixabay.com/audio/2021/08/09/audio_8816d77350.mp3", // Magic twinkle
    meow: "https://cdn.pixabay.com/audio/2022/03/24/audio_79396e9690.mp3" // Soft cute meow
  };

  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.src = cuteSounds[type];
  audio.volume = 0.4;
  audio.play().catch(() => {}); 
};

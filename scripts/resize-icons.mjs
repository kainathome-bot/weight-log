import sharp from "sharp";

await sharp("public/app_icon.png")
  .resize(192, 192)
  .png()
  .toFile("public/pwa-192x192.png");

await sharp("public/app_icon.png")
  .resize(512, 512)
  .png()
  .toFile("public/pwa-512x512.png");

console.log("Done: pwa-192x192.png / pwa-512x512.png");

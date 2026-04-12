import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadImageToCloudinary = async (base64Image: string): Promise<string> => {
  try {
    // If we have a pure base64 string without data URI, we format it for Cloudinary
    let imagePayload = base64Image;
    if (!base64Image.startsWith("data:image")) {
       imagePayload = `data:image/jpeg;base64,${base64Image}`;
    }

    const result = await cloudinary.uploader.upload(imagePayload, {
      folder: "lifeos_nutrition",
      resource_type: "image",
    });
    
    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw new Error("Failed to upload image to Cloudinary");
  }
};

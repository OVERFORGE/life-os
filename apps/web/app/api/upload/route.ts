import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

// Configure cloudinary with credentials from env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { file, folder } = await req.json();

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Upload to cloudinary
    // file should be a base64 string: "data:image/jpeg;base64,/9j/4AAQSk..."
    const uploadResponse = await cloudinary.uploader.upload(file, {
      folder: folder || "life-os-uploads",
      resource_type: "image",
    });

    return NextResponse.json({ 
      success: true, 
      url: uploadResponse.secure_url 
    });

  } catch (error: any) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
  }
}

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface IUserMcpServerDoc extends Document {
  userId: string;
  serverId: string;
  serverName: string;
  transportType: "STDIO" | "SSE" | "STREAMABLE_HTTP" | "UNVERIFIED";
  endpointOrCommand: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  discoveredTools: IDiscoveredTool[];
  createdAt: Date;
  updatedAt: Date;
}

const UserMcpServerSchema = new Schema<IUserMcpServerDoc>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    serverId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    serverName: {
      type: String,
      required: true,
    },
    transportType: {
      type: String,
      enum: ["STDIO", "SSE", "STREAMABLE_HTTP", "UNVERIFIED"],
      required: true,
    },
    endpointOrCommand: {
      type: String,
      required: true,
    },
    args: {
      type: [String],
      default: [],
    },
    env: {
      type: Map,
      of: String,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    discoveredTools: {
      type: [
        {
          name: { type: String, required: true },
          description: { type: String, default: "" },
          inputSchema: { type: Schema.Types.Mixed, default: {} },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: "user_mcp_servers",
  }
);

UserMcpServerSchema.index({ userId: 1, serverId: 1 }, { unique: true });

export const UserMcpServerModel: Model<IUserMcpServerDoc> =
  (mongoose.models?.UserMcpServer as Model<IUserMcpServerDoc>) ||
  mongoose.model<IUserMcpServerDoc>("UserMcpServer", UserMcpServerSchema);

import envSchema from "env-schema";

interface env {
    HOST: string;
    PORT: number;
    LINKER_TOKEN: string;
}

const schema = {
    type: "object",
    required: ["PORT", "LINKER_TOKEN"],
    properties: {
        HOST: { type: "string", default: "127.0.0.1" }
        PORT: { type: "number", default: 3003 },
        LINKER_TOKEN: { type: "string" }
    }
};

const config = envSchema<env>({
    schema,
    dotenv: true
});

export default config;
export type Config = typeof config;

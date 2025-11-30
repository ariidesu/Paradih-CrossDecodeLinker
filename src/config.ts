import envSchema from "env-schema";

interface env {
    PORT: number;
    LINKER_TOKEN: string;
}

const schema = {
    type: "object",
    required: ["PORT", "LINKER_TOKEN"],
    properties: {
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

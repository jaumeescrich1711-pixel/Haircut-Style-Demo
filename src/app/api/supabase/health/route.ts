import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.from("services").select("*").limit(1);

    if (error) {
      return Response.json(
        {
          ok: false,
          errorCode: error.code,
          message:
            "Supabase respondió, pero la lectura de public.services no está disponible. Revisa la tabla y sus políticas RLS.",
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: true,
      message: "Conexión y lectura de Supabase correctas.",
      rowsRead: data.length,
    });
  } catch {
    return Response.json(
      {
        ok: false,
        message:
          "Supabase no está configurado. Añade la URL y la publishable key al entorno.",
      },
      { status: 503 },
    );
  }
}

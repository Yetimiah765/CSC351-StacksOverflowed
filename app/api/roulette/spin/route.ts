import { NextResponse } from "next/server";
import { spinRoulette } from "../../../../lib/roulette/spin";

export async function POST() {
  const result = spinRoulette();

  return NextResponse.json({
    success: true,
    number: result,
  });
}

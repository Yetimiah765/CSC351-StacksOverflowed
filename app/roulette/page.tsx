"use client";

import React, { useState } from "react";
import Image from "next/image";

type BetType =
  | "straight"
  | "split"
  | "street"
  | "corner"
  | "sixline"
  | "dozen"
  | "column"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high";

interface Bet {
  id: number;
  type: BetType;
  label: string;
  coveredNumbers: number[];
}

const NUMBER_LAYOUT: number[][] = [
  [0],
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
  [13, 14, 15],
  [16, 17, 18],
  [19, 20, 21],
  [22, 23, 24],
  [25, 26, 27],
  [28, 29, 30],
  [31, 32, 33],
  [34, 35, 36],
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const BLACK_NUMBERS = new Set([
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35,
]);

export default function RoulettePage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [nextBetId, setNextBetId] = useState(1);
  const [resultNumber, setResultNumber] = useState<number | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const addBet = (bet: Omit<Bet, "id">) => {
    setBets((prev) => [...prev, { ...bet, id: nextBetId }]);
    setNextBetId((id) => id + 1);
  };

  const removeBet = (id: number) => {
    setBets((prev) => prev.filter((b) => b.id !== id));
  };

  const handleStraightBet = (num: number) => {
    addBet({
      type: "straight",
      label: `Straight ${num}`,
      coveredNumbers: [num],
    });
  };

  const handleOutsideBet = (type: BetType) => {
    let label = "";
    let covered: number[] = [];

    switch (type) {
      case "red":
        label = "Red";
        covered = Array.from(RED_NUMBERS);
        break;
      case "black":
        label = "Black";
        covered = Array.from(BLACK_NUMBERS);
        break;
      case "odd":
        label = "Odd";
        covered = Array.from({ length: 36 }, (_, i) => i + 1).filter(
          (n) => n % 2 === 1
        );
        break;
      case "even":
        label = "Even";
        covered = Array.from({ length: 36 }, (_, i) => i + 1).filter(
          (n) => n % 2 === 0
        );
        break;
      case "low":
        label = "1–18";
        covered = Array.from({ length: 18 }, (_, i) => i + 1);
        break;
      case "high":
        label = "19–36";
        covered = Array.from({ length: 18 }, (_, i) => i + 19);
        break;
      case "dozen":
      case "column":
      case "street":
      case "corner":
      case "sixline":
        // You can expand these later; for now we keep it simple.
        return;
    }

    addBet({ type, label, coveredNumbers: covered });
  };

  const spinWheel = () => {
    if (isSpinning) return;
    setIsSpinning(true);

    const randomNumber = Math.floor(Math.random() * 37); // 0–36
    setTimeout(() => {
      setResultNumber(randomNumber);
      setIsSpinning(false);
    }, 1500);
  };

  const getNumberColor = (num: number) => {
    if (num === 0) return "bg-green-600";
    if (RED_NUMBERS.has(num)) return "bg-red-600";
    if (BLACK_NUMBERS.has(num)) return "bg-gray-900";
    return "bg-gray-700";
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="flex gap-8 max-w-6xl w-full px-6 py-10">
        {/* Left: Wheel */}
        <div className="flex flex-col items-center gap-4 w-1/3">
          <div className="relative w-64 h-64">
            <Image
              src="/roulette-wheel.png"
              alt="Roulette Wheel"
              fill
              className={isSpinning ? "animate-spin-slow" : ""}
            />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-b-[20px] border-l-transparent border-r-transparent border-b-yellow-400" />
          </div>
          <button
            onClick={spinWheel}
            className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-500 rounded font-semibold"
          >
            Spin
          </button>
          <div className="mt-2 text-sm">
            Result:{" "}
            {resultNumber === null ? "—" : (
              <span className="font-bold">{resultNumber}</span>
            )}
          </div>
        </div>

        {/* Right: Table + Bet list */}
        <div className="flex w-2/3 gap-6">
          {/* Table */}
          <div className="flex-1 bg-gray-900 rounded-lg p-4">
            <div className="text-center mb-2 font-semibold">
              European Roulette Table
            </div>

            {/* 0 row */}
            <div className="grid grid-cols-1 mb-2">
              <button
                onClick={() => handleStraightBet(0)}
                className={`h-10 ${getNumberColor(
                  0
                )} flex items-center justify-center rounded text-sm`}
              >
                0
              </button>
            </div>

            {/* 1–36 grid (3 columns) */}
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 36 }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  onClick={() => handleStraightBet(num)}
                  className={`h-10 ${getNumberColor(
                    num
                  )} flex items-center justify-center rounded text-sm`}
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Simple outside bet row */}
            <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
              <button
                onClick={() => handleOutsideBet("low")}
                className="h-10 bg-gray-800 rounded flex items-center justify-center"
              >
                1–18
              </button>
              <button
                onClick={() => handleOutsideBet("even")}
                className="h-10 bg-gray-800 rounded flex items-center justify-center"
              >
                EVEN
              </button>
              <button
                onClick={() => handleOutsideBet("odd")}
                className="h-10 bg-gray-800 rounded flex items-center justify-center"
              >
                ODD
              </button>
              <button
                onClick={() => handleOutsideBet("high")}
                className="h-10 bg-gray-800 rounded flex items-center justify-center"
              >
                19–36
              </button>
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <button
                onClick={() => handleOutsideBet("red")}
                className="h-10 bg-red-700 rounded flex items-center justify-center"
              >
                RED
              </button>
              <button
                onClick={() => handleOutsideBet("black")}
                className="h-10 bg-gray-950 rounded flex items-center justify-center"
              >
                BLACK
              </button>
              {/* Dozens/columns can be added later here */}
            </div>
          </div>

          {/* Bet list */}
          <div className="w-1/3 bg-gray-900 rounded-lg p-4">
            <div className="font-semibold mb-2">Current Bets</div>
            {bets.length === 0 ? (
              <div className="text-xs text-gray-400">
                No bets placed yet. Click numbers or outside areas to add bets.
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {bets.map((bet) => (
                  <li
                    key={bet.id}
                    className="flex justify-between items-center bg-gray-800 rounded px-2 py-1"
                  >
                    <div>
                      <div className="font-semibold">{bet.label}</div>
                      <div className="text-gray-400">
                        Covers: {bet.coveredNumbers.join(", ")}
                      </div>
                    </div>
                    <button
                      onClick={() => removeBet(bet.id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Simple spin animation class */}
      <style jsx>{`
        .animate-spin-slow {
          animation: spin 1.5s linear;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

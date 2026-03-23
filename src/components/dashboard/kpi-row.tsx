"use client";

import { motion, type Variants } from "framer-motion";

interface KPIItem {
  label: string;
  value: string | number;
  subtitle?: string;
  subtitleColor?: "default" | "danger";
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export function KPIRow({ items }: { items: KPIItem[] }) {
  return (
    // Stitch: KPI strip is a flat grid — tonal background divides cells, no boxes
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 sm:grid-cols-4"
      style={{
        backgroundColor: "#ffffff",
        borderTop: "0.5px solid rgba(169,180,185,0.3)",
        borderBottom: "0.5px solid rgba(169,180,185,0.3)",
      }}
    >
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          variants={itemVariants}
          className="p-6 flex flex-col gap-2"
          style={{
            borderRight:
              i < items.length - 1
                ? "0.5px solid rgba(169,180,185,0.3)"
                : undefined,
          }}
        >
          {/* Label: coordinate kicker */}
          <p
            className="font-sans text-[10px] font-medium uppercase tracking-[0.2em]"
            style={{ color: "#717c82" }}
          >
            {item.label}
          </p>
          {/* Value: Space Grotesk display number */}
          <p
            className="font-display font-light tracking-tight leading-none"
            style={{ fontSize: "2rem", color: "#2a3439" }}
          >
            {item.value}
          </p>
          {item.subtitle && (
            <p
              className="font-sans text-[11px]"
              style={{
                color:
                  item.subtitleColor === "danger" ? "#9f403d" : "#566166",
              }}
            >
              {item.subtitle}
            </p>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

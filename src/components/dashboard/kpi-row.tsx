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
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function KPIRow({ items }: { items: KPIItem[] }) {
  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6"
    >
      {items.map((item) => (
        <motion.div 
          key={item.label}
          variants={itemVariants}
          className="card-machined overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-zinc-300 hover:-translate-y-1"
        >
          <div className="p-5">
            <p className="text-[13px] font-medium text-zinc-500 uppercase tracking-wider">{item.label}</p>
            <p className="mt-3 data-value-lg">
              {item.value}
            </p>
            {item.subtitle && (
              <p
                className={`mt-2 text-[13px] font-medium ${
                  item.subtitleColor === "danger" ? "text-red-600" : "text-zinc-500"
                }`}
              >
                {item.subtitle}
              </p>
            )}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

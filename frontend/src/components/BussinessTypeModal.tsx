// src/components/BusinessTypeModal.tsx
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

const BUSINESS_TYPES = [
  {
    id: "sole_trader",
    name: "Sole Trader",
    description: "A business owned and run by one individual",
    icon: "👤",
  },
  {
    id: "partnership",
    name: "Partnership",
    description: "A business owned by two or more people",
    icon: "👥",
  },
  {
    id: "limited_company",
    name: "Limited Company",
    description: "A company registered at Companies House",
    icon: "🏢",
  },
];

interface BusinessTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BusinessTypeModal({ isOpen, onClose }: BusinessTypeModalProps) {
  const navigate = useNavigate();

  // Handle escape key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden"; // Prevent background scroll
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleSelect = (type: string) => {
    onClose();
    navigate(`/customers/new?type=${type}`);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-surface-raised p-6 shadow-xl transition-all">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-muted-soft hover:text-muted"
            >
              ✕
            </button>

            <h3 className="text-lg font-semibold text-ink">Select Business Type</h3>
            <p className="mt-1 text-sm text-muted">
              Choose the legal structure of your business to continue
            </p>

            <div className="mt-6 grid gap-3">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => handleSelect(type.id)}
                  className="flex items-center gap-4 rounded-lg border border-border p-4 transition-all hover:border-brand hover:bg-brand/5 group"
                >
                  <span className="text-2xl">{type.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-ink">{type.name}</div>
                    <div className="text-sm text-muted">{type.description}</div>
                  </div>
                  <span className="text-muted-soft transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
import { useState } from "react";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

interface Props {
  value: string;
  onChange: (value: string) => void;
  filters: {
    format: string;
    rating: string;
    readingStatus: string;
  };
  onFiltersChange: (filters: {
    format: string;
    rating: string;
    readingStatus: string;
  }) => void;
}

export function SearchBar({
  value,
  onChange,
  filters,
  onFiltersChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const hasActiveFilters = Object.values(filters).some((v) => v !== "all");

  const handleFilterChange = (filterType: string, value: string) => {
    onFiltersChange({ ...filters, [filterType]: value });
  };

  return (
    <div className="relative flex items-center space-x-4">
      {/* Search Input */}
      <div className="flex-1 relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search by title, author, ISBN..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Filter Button */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
            isOpen || hasActiveFilters
              ? "bg-slate-700 text-white shadow-md"
              : "bg-slate-900 text-white hover:bg-slate-800"
          }`}
        >
          <FunnelIcon className="h-4 w-4" />
          Filters
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Filter Dropdown */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
            <div className="p-4 space-y-4">
              <h3 className="text-sm font-medium text-slate-900">
                Filter Books
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Format
                  </label>
                  <select
                    value={filters.format}
                    onChange={(e) =>
                      handleFilterChange("format", e.target.value)
                    }
                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                  >
                    <option value="all">All Formats</option>
                    <option value="pdf">PDF</option>
                    <option value="epub">EPUB</option>
                    <option value="audio">Audio</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Rating
                  </label>
                  <select
                    value={filters.rating}
                    onChange={(e) =>
                      handleFilterChange("rating", e.target.value)
                    }
                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                  >
                    <option value="all">All Ratings</option>
                    <option value="5">★★★★★</option>
                    <option value="4">★★★★☆ & up</option>
                    <option value="3">★★★☆☆ & up</option>
                    <option value="unrated">Unrated</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Status
                  </label>
                  <select
                    value={filters.readingStatus}
                    onChange={(e) =>
                      handleFilterChange("readingStatus", e.target.value)
                    }
                    className="w-full text-xs border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                  >
                    <option value="all">All Books</option>
                    <option value="unread">Not Started</option>
                    <option value="reading">Currently Reading</option>
                    <option value="finished">Finished</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => {
                    onFiltersChange({
                      format: "all",
                      rating: "all",
                      readingStatus: "all",
                    });
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Reset filters
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-xs px-3 py-1 bg-slate-900 text-white rounded-full hover:bg-slate-700 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

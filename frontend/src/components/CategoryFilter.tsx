import React from 'react';
import { FilterChips } from './FilterChips';

export interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  className?: string;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  className = '',
}) => {
  const options = [
    { id: 'all', label: 'All Categories' },
    ...categories.map((cat) => ({
      id: cat.toLowerCase(),
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
    })),
  ];

  return (
    <FilterChips
      options={options}
      selectedId={selectedCategory.toLowerCase()}
      onSelect={(id) => onSelectCategory(id === 'all' ? '' : id)}
      onClear={() => onSelectCategory('')}
      className={className}
    />
  );
};

import { db } from "./connection";
import { categoriesTable, categoryAttributesTable } from "./schema";
import { v4 as uuidv4 } from "uuid"; // Import the UUID generator
// Map for temporary storage of generated IDs
const generatedIdMap = new Map<string, string>();

// 1. Define Parent Categories
const parentCategoryData = [
  {
    name: "Toys",
    image_url: "https://storage.googleapis.com/sellio/categories/toys.jpg",
    description: "Playthings and games for entertainment and learning.",
  },
  {
    name: "Vehicles",
    image_url: "https://storage.googleapis.com/sellio/categories/vehicle.jpg",
    description: "Machines for transporting people or cargo.",
  },
  {
    name: "Mobile Phones",
    image_url:
      "https://storage.googleapis.com/sellio/categories/mobile%20phone.jpg",
    description: "Handheld devices for communication and internet access.",
  },
  {
    name: "Fashion Clothes",
    image_url:
      "https://storage.googleapis.com/sellio/categories/fashion%20clothes.avif",
    description: "Apparel, footwear, and accessories for style.",
  },
  {
    name: "Electronics",
    image_url:
      "https://storage.googleapis.com/sellio/categories/electronics.jpg",
    description: "Modern electric devices and digital equipment.",
  },
];

// 2. Define Child Categories, referencing the Parent by its name
const childCategoryData = [
  // Children of Electronics
  {
    name: "Audio Equipment",
    parentName: "Electronics",
    image_url:
      "https://storage.googleapis.com/sellio/categories/audioequipment.jpg",
    description: "Devices for recording, transmitting, or reproducing sound.",
  },
  {
    name: "Laptops",
    parentName: "Electronics",
    image_url: "https://storage.googleapis.com/sellio/categories/laptop.jpg",
    description: "Portable personal computers for mobile use.",
  },
  {
    name: "Tablets",
    parentName: "Electronics",
    image_url: "https://storage.googleapis.com/sellio/categories/tablet.jpg",
    description: "Flat, thin devices with a touchscreen interface.",
  },
  {
    name: "Gaming",
    parentName: "Electronics",
    image_url: "https://storage.googleapis.com/sellio/categories/gaming.jpg",
    description: "Consoles, accessories, and components for video games.",
  },

  // Children of Fashion Clothes
  {
    name: "Women's Clothing",
    parentName: "Fashion Clothes",
    image_url:
      "https://storage.googleapis.com/sellio/categories/women's%20clothing.webp",
    description: "Apparel designed for women.",
  },
  {
    name: "Men's Clothing",
    parentName: "Fashion Clothes",
    image_url:
      "https://storage.googleapis.com/sellio/categories/men%20clothe.webp",
    description: "Apparel designed for men.",
  },
  {
    name: "Shoes",
    parentName: "Fashion Clothes",
    image_url: "https://storage.googleapis.com/sellio/categories/shoes.webp",
    description: "Footwear for various activities and occasions.",
  },

  // Children of Toys
  {
    name: "Educational Toys",
    parentName: "Toys",
    image_url:
      "https://storage.googleapis.com/sellio/categories/educational%20toys.webp",
    description: "Toys designed to teach a child about a particular subject.",
  },
  {
    name: "Action Figures",
    parentName: "Toys",
    image_url:
      "https://storage.googleapis.com/sellio/categories/action%20figures.jpg",
    description: "Movable figures of characters from media.",
  },
  {
    name: "Board Games",
    parentName: "Toys",
    image_url:
      "https://storage.googleapis.com/sellio/categories/boardgames.jpg",
    description: "Tabletop games using pieces on a pre-marked surface.",
  },

  // Children of Vehicles
  {
    name: "Cars",
    parentName: "Vehicles",
    image_url: "https://storage.googleapis.com/sellio/categories/cars.avif",
    description: "Automobiles for personal transport.",
  },
  {
    name: "Car Parts",
    parentName: "Vehicles",
    image_url:
      "https://storage.googleapis.com/sellio/categories/car%20parts.jpg",
    description:
      "Components and accessories for vehicle repair and customization.",
  },
  {
    name: "Motorcycles",
    parentName: "Vehicles",
    image_url:
      "https://storage.googleapis.com/sellio/categories/motorcycle.jpg",
    description: "Two-wheeled motor vehicles.",
  },

  // Children of Mobile Phones
  {
    name: "Phone Accessories",
    parentName: "Mobile Phones",
    image_url:
      "https://storage.googleapis.com/sellio/categories/phone%20accessories.avif",
    description: "Add-ons like cases, chargers, and headphones.",
  },
  {
    name: "Smartphones",
    parentName: "Mobile Phones",
    image_url:
      "https://storage.googleapis.com/sellio/categories/smartphone.jpg",
    description: "Advanced mobile phones with computer capabilities.",
  },
];

// --- 2. Generate UUIDs for all Parent Categories ---
const parentSeeds: (typeof categoriesTable.$inferInsert)[] =
  parentCategoryData.map((cat) => {
    const newId = uuidv4();
    generatedIdMap.set(cat.name, newId); // Store the generated ID for later lookup
    return {
      id: newId, // Assign the proper UUID
      name: cat.name,
      image_url: cat.image_url,
      description: cat.description,
      parentId: undefined, // Parents have no parentId
    };
  });

// --- 3. Generate UUIDs for all Child Categories and set Parent IDs ---
const childSeeds: (typeof categoriesTable.$inferInsert)[] =
  childCategoryData.map((cat) => {
    const parentId = generatedIdMap.get(cat.parentName);

    if (!parentId) {
      throw new Error(`Parent category "${cat.parentName}" not found in map.`);
    }

    return {
      id: uuidv4(), // Assign a proper UUID
      name: cat.name,
      image_url: cat.image_url,
      description: cat.description,
      parentId: parentId, // Look up and set the parent's generated UUID
    };
  });

// --- 4. Combine all seeds ---
const categorySeeds: (typeof categoriesTable.$inferInsert)[] = [
  ...parentSeeds,
  ...childSeeds,
];

async function seedCategories() {
  try {
    await db.delete(categoriesTable);
    await db.insert(categoriesTable).values(categorySeeds);
  } catch (error) {
    console.error("Error seeding categories:", error);
    throw error;
  }
}


async function seedCategoryAttributes() {
  try {
    await db.delete(categoryAttributesTable);

    const existingCategories = await db.select().from(categoriesTable);

    if (existingCategories.length === 0) {
      console.error("No categories found to seed attributes for.");
      return;
    }

    // Find specific categories by name 
    const findCategory = (name: string) => existingCategories.find(c => c.name.toLowerCase() === name.toLowerCase());

    // Parent categories
    const mobilePhones = findCategory("Mobile Phones");
    const electronics = findCategory("Electronics");
    const fashionClothes = findCategory("Fashion Clothes");
    const toys = findCategory("Toys");
    const vehicles = findCategory("Vehicles");

    if (!mobilePhones || !electronics || !fashionClothes || !toys || !vehicles) {
      console.error("One or more parent categories not found.");
      return;
    }

    // Subcategories under Mobile Phones
    const smartphones = findCategory('Smartphones');
    const phoneAccessories = findCategory('Phone Accessories');
    const tablets = findCategory('Tablets');

    // Subcategories under Vehicles
    const cars = findCategory('Cars');
    const motorcycles = findCategory('Motorcycles');
    const carParts = findCategory('Car Parts');

    // Subcategories under Fashion Clothes
    const mensClothing = findCategory("Men's Clothing");
    const womensClothing = findCategory("Women's Clothing");
    const shoes = findCategory('Shoes');

    // Subcategories under Toys
    const actionFigures = findCategory('Action Figures');
    const boardGames = findCategory('Board Games');
    const educationalToys = findCategory('Educational Toys');

    // Subcategories under Electronics
    const laptops = findCategory('Laptops');
    const gaming = findCategory('Gaming');
    const audioEquipment = findCategory('Audio Equipment');

    if (!phoneAccessories || !laptops || !tablets || !gaming || !womensClothing || !mensClothing || !shoes || !educationalToys || !actionFigures || !boardGames || !cars || !carParts || !motorcycles) {
      console.error("One or more child categories not found.");
      return;
    }

    const attributeTemplates = [
      // Mobile Phones -> Smartphones subcategory
      ...(smartphones && mobilePhones ? [
        {
          categoryId: mobilePhones.id,
          subCategoryId: smartphones.id,
          attributeKey: "brand",
          label: "Brand",
          type: "text",
          isRequired: true,
          validation: {
            required: true,
          },
          help_text: "The brand of the smartphone.",
          placeholder: "e.g., Apple, Samsung, Google, OnePlus, etc.",
          sortOrder: 1,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: smartphones.id,
          attributeKey: 'model',
          label: 'Model',
          type: 'text' as const,
          isRequired: true,
          placeholder: 'e.g., iPhone 15 Pro, Galaxy S24',
          validation: { minLength: 2, maxLength: 100 },
          sortOrder: 2,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: smartphones.id,
          attributeKey: 'storage',
          label: 'Storage Capacity',
          type: 'select' as const,
          isRequired: true,
          options: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'],
          sortOrder: 3,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: smartphones.id,
          attributeKey: 'color',
          label: 'Color',
          type: 'text' as const,
          isRequired: false,
          placeholder: 'e.g., Space Gray, Rose Gold',
          sortOrder: 4,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: smartphones.id,
          attributeKey: 'unlocked',
          label: 'Unlocked',
          type: 'boolean' as const,
          isRequired: false,
          helpText: 'Is the phone carrier unlocked?',
          sortOrder: 5,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: smartphones.id,
          attributeKey: 'battery_health',
          label: 'Battery Health (%)',
          type: 'number' as const,
          isRequired: false,
          placeholder: '85',
          helpText: 'Battery health percentage (if known)',
          validation: { min: 0, max: 100 },
          sortOrder: 6,
        },
      ] : []),

      // Mobile Phones -> Phone Accessories subcategory
      ...(phoneAccessories && mobilePhones ? [
        {
          categoryId: mobilePhones.id,
          subcategoryId: phoneAccessories.id,
          attributeKey: 'brand',
          label: 'Brand',
          type: 'text' as const,
          isRequired: true,
          placeholder: 'e.g., Apple, Anker, Belkin',
          validation: { minLength: 1, maxLength: 50 },
          sortOrder: 1,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: phoneAccessories.id,
          attributeKey: 'accessory_type',
          label: 'Accessory Type',
          type: 'text' as const,
          isRequired: true,
          placeholder: 'e.g., Case, Screen Protector',
          validation: { minLength: 1, maxLength: 50 },
          sortOrder: 2,
        },
        {
          categoryId: mobilePhones.id,
          subcategoryId: phoneAccessories.id,
          attributeKey: 'compatible_devices',
          label: 'Compatible Devices',
          type: 'text' as const,
          isRequired: false,
          placeholder: 'e.g., iPhone 15, Samsung Galaxy S24',
          sortOrder: 3,
        },
      ] : []),

      // Mobile Phones -> Tablets subcategory
      ...(tablets && mobilePhones
        ? [
            {
              categoryId: mobilePhones.id,
              subcategoryId: tablets.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Apple, Samsung, Microsoft',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: mobilePhones.id,
              subcategoryId: tablets.id,
              attributeKey: 'model',
              label: 'Model',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., iPad Pro, Galaxy Tab S9',
              validation: { minLength: 2, maxLength: 100 },
              sortOrder: 2,
            },
            {
              categoryId: mobilePhones.id,
              subcategoryId: tablets.id,
              attributeKey: 'screen_size',
              label: 'Screen Size',
              type: 'text' as const,
              placeholder: 'e.g., 10.2", 11", 12.9"',
              validation: { minLength: 1, maxLength: 10 },
              isRequired: false,
              sortOrder: 3,
            },
            {
              categoryId: mobilePhones.id,
              subcategoryId: tablets.id,
              attributeKey: 'storage',
              label: 'Storage Capacity',
              type: 'select' as const,
              isRequired: true,
              options: ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB'],
              sortOrder: 4,
            },
          ]
        : []),

      // Vehicles -> Cars subcategory
      ...(cars && vehicles
        ? [
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'make',
              label: 'Make',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Toyota, Ford, Honda',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'model',
              label: 'Model',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Camry, Civic, F-150',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 2,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'year',
              label: 'Year',
              type: 'number' as const,
              isRequired: true,
              validation: { min: 1990, max: new Date().getFullYear() + 1 },
              sortOrder: 3,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'mileage',
              label: 'Mileage (km)',
              type: 'number' as const,
              isRequired: true,
              validation: { min: 0, max: 1000000 },
              placeholder: 'e.g., 50000',
              sortOrder: 4,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'fuel_type',
              label: 'Fuel Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Petrol',
                'Diesel',
                'Electric',
                'Hybrid',
                'Plug-in Hybrid',
                'LPG',
                'Other',
              ],
              sortOrder: 5,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'transmission',
              label: 'Transmission',
              type: 'select' as const,
              isRequired: false,
              options: ['Manual', 'Automatic', 'CVT', 'Semi-Automatic'],
              sortOrder: 6,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'body_type',
              label: 'Body Type',
              type: 'select' as const,
              isRequired: false,
              options: [
                'Sedan',
                'SUV',
                'Hatchback',
                'Coupe',
                'Convertible',
                'Wagon',
                'Pickup',
                'Van',
                'Other',
              ],
              sortOrder: 7,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'color',
              label: 'Color',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Silver, Black, White',
              sortOrder: 8,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'number_of_doors',
              label: 'Number of Doors',
              type: 'select' as const,
              isRequired: false,
              options: ['2', '3', '4', '5'],
              sortOrder: 9,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'number_of_owners',
              label: 'Number of Previous Owners',
              type: 'number' as const,
              isRequired: false,
              validation: { min: 0, max: 10 },
              sortOrder: 10,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'service_history',
              label: 'Full Service History Available',
              type: 'boolean' as const,
              isRequired: false,
              sortOrder: 11,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'accident_free',
              label: 'Accident Free',
              type: 'boolean' as const,
              isRequired: false,
              sortOrder: 12,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: cars.id,
              attributeKey: 'maintenance_checklist',
              label: 'Maintenance Checklist',
              type: 'file_upload' as const,
              isRequired: false,
              helpText: 'Upload photos of maintenance records, service history, or inspection reports',
              sortOrder: 13,
            },
          ]
        : []),

      // Vehicles -> Motorcycles subcategory
      ...(motorcycles && vehicles
        ? [
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'make',
              label: 'Make',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Honda',
                'Yamaha',
                'Kawasaki',
                'Suzuki',
                'Harley-Davidson',
                'BMW',
                'Ducati',
                'KTM',
                'Triumph',
                'Indian',
                'Other',
              ],
              sortOrder: 1,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'model',
              label: 'Model',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., CBR600RR, Ninja 650',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 2,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'year',
              label: 'Year',
              type: 'number' as const,
              isRequired: true,
              validation: { min: 1990, max: new Date().getFullYear() + 1 },
              sortOrder: 3,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'engine_size',
              label: 'Engine Size (cc)',
              type: 'number' as const,
              isRequired: true,
              validation: { min: 50, max: 2500 },
              placeholder: 'e.g., 600, 1000',
              sortOrder: 4,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'mileage',
              label: 'Mileage (km)',
              type: 'number' as const,
              isRequired: true,
              validation: { min: 0, max: 500000 },
              placeholder: 'e.g., 15000',
              sortOrder: 5,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'motorcycle_type',
              label: 'Type',
              type: 'select' as const,
              isRequired: false,
              options: [
                'Sport',
                'Cruiser',
                'Touring',
                'Standard',
                'Adventure',
                'Dirt',
                'Scooter',
                'Other',
              ],
              sortOrder: 6,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: motorcycles.id,
              attributeKey: 'maintenance_checklist',
              label: 'Maintenance Checklist',
              type: 'file_upload' as const,
              isRequired: false,
              helpText: 'Upload photos of maintenance records, service history, or inspection reports',
              sortOrder: 7,
            },
          ]
        : []),

      // Vehicles -> Car Parts subcategory
      ...(carParts && vehicles
        ? [
            {
              categoryId: vehicles.id,
              subcategoryId: carParts.id,
              attributeKey: 'part_type',
              label: 'Part Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Engine Parts',
                'Transmission',
                'Brakes',
                'Suspension',
                'Electrical',
                'Body Parts',
                'Interior',
                'Exhaust',
                'Wheels & Tires',
                'Fluids',
                'Other',
              ],
              sortOrder: 1,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: carParts.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., OEM, Bosch, Brembo',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 2,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: carParts.id,
              attributeKey: 'part_number',
              label: 'Part Number',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., 12345-67890',
              sortOrder: 3,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: carParts.id,
              attributeKey: 'compatible_vehicles',
              label: 'Compatible Vehicles',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Toyota Camry 2018-2023',
              validation: { minLength: 1, maxLength: 200 },
              sortOrder: 4,
            },
            {
              categoryId: vehicles.id,
              subcategoryId: carParts.id,
              attributeKey: 'new_or_used',
              label: 'Condition',
              type: 'select' as const,
              isRequired: true,
              options: ['New', 'Used', 'Refurbished'],
              sortOrder: 5,
            },
          ]
        : []),

      // Fashion Clothes -> Men's Clothing subcategory
      ...(mensClothing && fashionClothes
        ? [
            {
              categoryId: fashionClothes.id,
              subcategoryId: mensClothing.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Nike, Adidas, Zara, H&M',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: mensClothing.id,
              attributeKey: 'size',
              label: 'Size',
              type: 'select' as const,
              isRequired: true,
              options: [
                'XS',
                'S',
                'M',
                'L',
                'XL',
                'XXL',
                'XXXL',
                '28',
                '30',
                '32',
                '34',
                '36',
                '38',
                '40',
                '42',
                '44',
              ],
              sortOrder: 2,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: mensClothing.id,
              attributeKey: 'clothing_type',
              label: 'Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'T-Shirt',
                'Shirt',
                'Jeans',
                'Pants',
                'Jacket',
                'Sweater',
                'Hoodie',
                'Shorts',
                'Suit',
                'Other',
              ],
              sortOrder: 3,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: mensClothing.id,
              attributeKey: 'color',
              label: 'Color',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Black, Navy, Red',
              sortOrder: 4,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: mensClothing.id,
              attributeKey: 'material',
              label: 'Material',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Cotton, Polyester, Wool',
              sortOrder: 5,
            },
          ]
        : []),

      // Fashion Clothes -> Women's Clothing subcategory
      ...(womensClothing && fashionClothes
        ? [
            {
              categoryId: fashionClothes.id,
              subcategoryId: womensClothing.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Zara, H&M, Forever 21, Chanel',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: womensClothing.id,
              attributeKey: 'size',
              label: 'Size',
              type: 'select' as const,
              isRequired: true,
              options: [
                'XS',
                'S',
                'M',
                'L',
                'XL',
                'XXL',
                '0',
                '2',
                '4',
                '6',
                '8',
                '10',
                '12',
                '14',
                '16',
                '18',
                '20',
              ],
              sortOrder: 2,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: womensClothing.id,
              attributeKey: 'clothing_type',
              label: 'Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Dress',
                'Blouse',
                'T-Shirt',
                'Jeans',
                'Pants',
                'Skirt',
                'Jacket',
                'Sweater',
                'Cardigan',
                'Shorts',
                'Other',
              ],
              sortOrder: 3,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: womensClothing.id,
              attributeKey: 'color',
              label: 'Color',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Black, Navy, Red',
              sortOrder: 4,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: womensClothing.id,
              attributeKey: 'material',
              label: 'Material',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Cotton, Silk, Chiffon',
              sortOrder: 5,
            },
          ]
        : []),

      // Fashion Clothes -> Shoes subcategory
      ...(shoes && fashionClothes
        ? [
            {
              categoryId: fashionClothes.id,
              subcategoryId: shoes.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Nike, Adidas, Jordan, Converse',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: shoes.id,
              attributeKey: 'size',
              label: 'Size',
              type: 'select' as const,
              isRequired: true,
              options: [
                '5',
                '5.5',
                '6',
                '6.5',
                '7',
                '7.5',
                '8',
                '8.5',
                '9',
                '9.5',
                '10',
                '10.5',
                '11',
                '11.5',
                '12',
                '12.5',
                '13',
                '13.5',
                '14',
                '15',
              ],
              sortOrder: 2,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: shoes.id,
              attributeKey: 'shoe_type',
              label: 'Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Sneakers',
                'Boots',
                'Dress Shoes',
                'Sandals',
                'Heels',
                'Flats',
                'Athletic',
                'Casual',
                'Other',
              ],
              sortOrder: 3,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: shoes.id,
              attributeKey: 'gender',
              label: 'Gender',
              type: 'select' as const,
              isRequired: true,
              options: ['Men', 'Women', 'Unisex', 'Boys', 'Girls'],
              sortOrder: 4,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: shoes.id,
              attributeKey: 'color',
              label: 'Color',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Black, White, Red',
              sortOrder: 5,
            },
            {
              categoryId: fashionClothes.id,
              subcategoryId: shoes.id,
              attributeKey: 'original_box',
              label: 'Original Box Included',
              type: 'boolean' as const,
              isRequired: false,
              sortOrder: 6,
            },
          ]
        : []),

      // Toys -> Action Figures subcategory
      ...(actionFigures && toys
        ? [
            {
              categoryId: toys.id,
              subcategoryId: actionFigures.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Hasbro, Mattel, Bandai',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: toys.id,
              subcategoryId: actionFigures.id,
              attributeKey: 'character_franchise',
              label: 'Character/Franchise',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Marvel, Star Wars, Transformers',
              sortOrder: 2,
            },
            {
              categoryId: toys.id,
              subcategoryId: actionFigures.id,
              attributeKey: 'scale_size',
              label: 'Scale/Size',
              type: 'select' as const,
              isRequired: false,
              options: [
                '3.75\"',
                '6\"',
                '12\"',
                '1/6 Scale',
                '1/12 Scale',
                'Other',
              ],
              sortOrder: 3,
            },
            {
              categoryId: toys.id,
              subcategoryId: actionFigures.id,
              attributeKey: 'packaging_condition',
              label: 'Packaging',
              type: 'select' as const,
              isRequired: false,
              options: ['Mint in Package', 'Opened', 'Loose', 'Custom Package'],
              sortOrder: 4,
            },
          ]
        : []),

      // Toys -> Board Games subcategory
      ...(boardGames && toys
        ? [
            {
              categoryId: toys.id,
              subcategoryId: boardGames.id,
              attributeKey: 'game_title',
              label: 'Game Title',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Monopoly, Scrabble, Settlers of Catan',
              validation: { minLength: 1, maxLength: 100 },
              sortOrder: 1,
            },
            {
              categoryId: toys.id,
              subcategoryId: boardGames.id,
              attributeKey: 'age_range',
              label: 'Age Range',
              type: 'select' as const,
              isRequired: true,
              options: ['3+', '6+', '8+', '10+', '12+', '14+', '16+', 'Adult'],
              sortOrder: 2,
            },
            {
              categoryId: toys.id,
              subcategoryId: boardGames.id,
              attributeKey: 'players',
              label: 'Number of Players',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., 2-4 players, 1-6 players',
              sortOrder: 3,
            },
            {
              categoryId: toys.id,
              subcategoryId: boardGames.id,
              attributeKey: 'complete_set',
              label: 'Complete Set',
              type: 'boolean' as const,
              isRequired: true,
              helpText: 'All pieces and instructions included',
              sortOrder: 4,
            },
          ]
        : []),

      // Toys -> Educational Toys subcategory
      ...(educationalToys && toys
        ? [
            {
              categoryId: toys.id,
              subcategoryId: educationalToys.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Fisher-Price, LeapFrog, VTech',
              validation: { minLength: 1, maxLength: 50 },
              sortOrder: 1,
            },
            {
              categoryId: toys.id,
              subcategoryId: educationalToys.id,
              attributeKey: 'age_range',
              label: 'Age Range',
              type: 'select' as const,
              isRequired: true,
              options: [
                '0-6 months',
                '6-12 months',
                '1-2 years',
                '2-3 years',
                '3-5 years',
                '5-8 years',
                '8+ years',
              ],
              sortOrder: 2,
            },
            {
              categoryId: toys.id,
              subcategoryId: educationalToys.id,
              attributeKey: 'learning_focus',
              label: 'Learning Focus',
              type: 'select' as const,
              isRequired: false,
              options: [
                'Math',
                'Reading',
                'Science',
                'Motor Skills',
                'Problem Solving',
                'Creativity',
                'Multiple',
              ],
              sortOrder: 3,
            },
            {
              categoryId: toys.id,
              subcategoryId: educationalToys.id,
              attributeKey: 'requires_batteries',
              label: 'Requires Batteries',
              type: 'boolean' as const,
              isRequired: false,
              sortOrder: 4,
            },
          ]
        : []),

      // Electronics -> Laptops subcategory
      ...(laptops && electronics
        ? [
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Apple',
                'Dell',
                'HP',
                'Lenovo',
                'ASUS',
                'Acer',
                'MSI',
                'Microsoft',
                'Other',
              ],
              sortOrder: 1,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'model',
              label: 'Model',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., MacBook Pro 16", ThinkPad X1',
              validation: { minLength: 2, maxLength: 100 },
              sortOrder: 2,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'processor',
              label: 'Processor',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., Intel i7, Apple M2, AMD Ryzen 5',
              sortOrder: 3,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'ram',
              label: 'RAM',
              type: 'select' as const,
              isRequired: true,
              options: ['4GB', '8GB', '16GB', '32GB', '64GB', '128GB'],
              sortOrder: 4,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'storage',
              label: 'Storage',
              type: 'select' as const,
              isRequired: true,
              options: [
                '128GB SSD',
                '256GB SSD',
                '512GB SSD',
                '1TB SSD',
                '2TB SSD',
                '500GB HDD',
                '1TB HDD',
                '2TB HDD',
              ],
              sortOrder: 5,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'screen_size',
              label: 'Screen Size',
              type: 'select' as const,
              isRequired: false,
              options: ['11"', '12"', '13"', '14"', '15"', '16"', '17"', '18"'],
              sortOrder: 6,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'graphics_card',
              label: 'Graphics Card',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., NVIDIA RTX 4060, Integrated',
              sortOrder: 7,
            },
            {
              categoryId: electronics.id,
              subcategoryId: laptops.id,
              attributeKey: 'operating_system',
              label: 'Operating System',
              type: 'select' as const,
              isRequired: false,
              options: [
                'Windows 11',
                'Windows 10',
                'macOS',
                'Linux',
                'Chrome OS',
                'Other',
              ],
              sortOrder: 8,
            },
          ]
        : []),

      // Electronics -> Gaming subcategory
      ...(gaming && electronics
        ? [
            {
              categoryId: electronics.id,
              subcategoryId: gaming.id,
              attributeKey: 'platform',
              label: 'Gaming Platform',
              type: 'select' as const,
              isRequired: true,
              options: [
                'PlayStation 5',
                'PlayStation 4',
                'Xbox Series X/S',
                'Xbox One',
                'Nintendo Switch',
                'PC',
                'Other',
              ],
              sortOrder: 1,
            },
            {
              categoryId: electronics.id,
              subcategoryId: gaming.id,
              attributeKey: 'item_type',
              label: 'Item Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Console',
                'Game',
                'Controller',
                'Headset',
                'Accessory',
                'PC Component',
              ],
              sortOrder: 2,
            },
            {
              categoryId: electronics.id,
              subcategoryId: gaming.id,
              attributeKey: 'title_name',
              label: 'Game Title (if applicable)',
              type: 'text' as const,
              isRequired: false,
              placeholder: 'e.g., Call of Duty, FIFA 24',
              sortOrder: 3,
            },
            {
              categoryId: electronics.id,
              subcategoryId: gaming.id,
              attributeKey: 'storage_capacity',
              label: 'Storage (for consoles)',
              type: 'select' as const,
              isRequired: false,
              options: ['500GB', '1TB', '2TB', 'Other'],
              sortOrder: 4,
            },
          ]
        : []),

      // Electronics -> Audio Equipment subcategory
      ...(audioEquipment && electronics
        ? [
            {
              categoryId: electronics.id,
              subcategoryId: audioEquipment.id,
              attributeKey: 'brand',
              label: 'Brand',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Sony',
                'Bose',
                'Apple',
                'Sennheiser',
                'Audio-Technica',
                'JBL',
                'Beats',
                'Marshall',
                'Other',
              ],
              sortOrder: 1,
            },
            {
              categoryId: electronics.id,
              subcategoryId: audioEquipment.id,
              attributeKey: 'equipment_type',
              label: 'Equipment Type',
              type: 'select' as const,
              isRequired: true,
              options: [
                'Headphones',
                'Earbuds',
                'Speakers',
                'Amplifier',
                'Turntable',
                'Microphone',
                'Audio Interface',
                'Other',
              ],
              sortOrder: 2,
            },
            {
              categoryId: electronics.id,
              subcategoryId: audioEquipment.id,
              attributeKey: 'model',
              label: 'Model',
              type: 'text' as const,
              isRequired: true,
              placeholder: 'e.g., AirPods Pro, WH-1000XM4',
              validation: { minLength: 2, maxLength: 100 },
              sortOrder: 3,
            },
            {
              categoryId: electronics.id,
              subcategoryId: audioEquipment.id,
              attributeKey: 'connection_type',
              label: 'Connection Type',
              type: 'select' as const,
              isRequired: false,
              options: ['Wired', 'Wireless', 'Bluetooth', 'Both'],
              sortOrder: 4,
            },
            {
              categoryId: electronics.id,
              subcategoryId: audioEquipment.id,
              attributeKey: 'noise_cancellation',
              label: 'Noise Cancellation',
              type: 'boolean' as const,
              isRequired: false,
              sortOrder: 5,
            },
          ]
        : []),
    ];

    if (attributeTemplates.length === 0) {
      console.error("No attribute templates found.");
      return;
    }

     // Filter out attributes with undefined categoryId (should not be inserted)
     const validAttributeTemplates = attributeTemplates.filter(
      (attr): attr is typeof attr & { categoryId: string } =>
        typeof attr.categoryId === 'string' &&
        attr.categoryId !== undefined &&
        attr.categoryId.length > 0
    );
    if (validAttributeTemplates.length === 0) {
      console.log('⚠️  No valid category attributes to insert');
      return;
    }

    // Insert category attributes
    await db
      .insert(categoryAttributesTable)
      .values(
        validAttributeTemplates.map(attr => ({
          ...attr,
          subCategoryId: (attr as any).subcategoryId ?? (attr as any).subCategoryId ?? undefined,
        }))
      );

      
  } catch (error) {
    console.error("Error seeding category attributes:", error);
    throw error;
  }
}




async function runSeed() {
  try {
    console.log("🌱 Starting category seeding...");
    await seedCategories();
    console.log("✅ Categories seeded successfully.");

    console.log("🌱 Starting category attributes seeding...");
    await seedCategoryAttributes();
    console.log("✅ Category attributes seeded successfully.");

    console.log("🎉 All seeding completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

runSeed();

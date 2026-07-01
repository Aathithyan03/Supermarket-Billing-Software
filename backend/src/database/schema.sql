CREATE DATABASE IF NOT EXISTS supermarket_db;
USE supermarket_db;

-- USERS
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role ENUM('admin','staff') DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME NULL
);

-- CATEGORIES
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- PRODUCTS
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id INT NULL,
    barcode VARCHAR(100) UNIQUE,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost_price DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_percent DECIMAL(5,2) DEFAULT 0,
    quantity INT DEFAULT 0,
    unit VARCHAR(30) DEFAULT 'pcs',
    low_stock_threshold INT DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_category
    FOREIGN KEY(category_id)
    REFERENCES categories(id)
    ON DELETE SET NULL
);

CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_barcode ON products(barcode);

-- CUSTOMERS
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE,
    email VARCHAR(150),
    address TEXT,
    loyalty_points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_phone ON customers(phone);

-- BILLS
CREATE TABLE bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bill_number VARCHAR(100) UNIQUE NOT NULL,

    customer_id INT,
    cashier_id INT,

    subtotal DECIMAL(10,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) DEFAULT 0,

    payment_method ENUM('cash','card','upi','other')
        DEFAULT 'cash',

    payment_status ENUM('paid','refunded','partial')
        DEFAULT 'paid',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE SET NULL,

    FOREIGN KEY(cashier_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_bill_date ON bills(created_at);

-- BILL ITEMS
CREATE TABLE bill_items (

    id INT AUTO_INCREMENT PRIMARY KEY,

    bill_id INT NOT NULL,

    product_id INT,

    product_name VARCHAR(255) NOT NULL,

    unit_price DECIMAL(10,2) NOT NULL,

    cost_price DECIMAL(10,2) DEFAULT 0,

    quantity INT NOT NULL,

    tax_percent DECIMAL(5,2) DEFAULT 0,

    line_total DECIMAL(10,2) NOT NULL,

    FOREIGN KEY(bill_id)
        REFERENCES bills(id)
        ON DELETE CASCADE,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE SET NULL
);

CREATE INDEX idx_bill_items_bill
ON bill_items(bill_id);

-- STOCK MOVEMENTS
CREATE TABLE stock_movements (

    id INT AUTO_INCREMENT PRIMARY KEY,

    product_id INT NOT NULL,

    type ENUM('in','out','sale','adjustment'),

    quantity INT NOT NULL,

    reason TEXT,

    reference_bill_id INT NULL,

    user_id INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE CASCADE,

    FOREIGN KEY(reference_bill_id)
        REFERENCES bills(id)
        ON DELETE SET NULL,

    FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- SETTINGS
CREATE TABLE settings (

    `key` VARCHAR(100) PRIMARY KEY,

    `value` TEXT NOT NULL
);

INSERT INTO settings (`key`,`value`) VALUES
('store_name','Supermarket Billing System'),
('invoice_prefix','INV'),
('currency_symbol','₹'),
('default_tax_percent','5')
ON DUPLICATE KEY UPDATE value=VALUES(value);

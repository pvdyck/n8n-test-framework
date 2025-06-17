export function getDataETLPipelineResponses(inputs: any, testName: string): any[] {
  // Determine scenario based on test name
  const isLowStock = testName.toLowerCase().includes('low stock') || 
                     testName.toLowerCase().includes('inventory');
  const isEmpty = testName.toLowerCase().includes('empty');
  const isCritical = testName.toLowerCase().includes('critical');
  
  const responses: any[] = [];
  const reportDate = new Date().toISOString().split('T')[0];
  const reportId = `REPORT-${reportDate}-${Date.now()}`;
  
  // 1. Prepare Date Range
  responses.push({
    json: {
      reportDate,
      startTimestamp: new Date(reportDate + 'T00:00:00.000Z').toISOString(),
      endTimestamp: new Date(reportDate + 'T23:59:59.999Z').toISOString(),
      reportId
    }
  });
  
  // 2. Extract Order Data
  if (isEmpty) {
    responses.push({
      json: {
        total_orders: '0',
        total_revenue: '0.00',
        avg_order_value: '0.00',
        unique_customers: '0'
      }
    });
  } else if (isCritical) {
    responses.push({
      json: {
        total_orders: '300',
        total_revenue: '50000.00',
        avg_order_value: '166.67',
        unique_customers: '250'
      }
    });
  } else if (isLowStock) {
    responses.push({
      json: {
        total_orders: '200',
        total_revenue: '35000.00',
        avg_order_value: '175.00',
        unique_customers: '180'
      }
    });
  } else {
    responses.push({
      json: {
        total_orders: '150',
        total_revenue: '25000.00',
        avg_order_value: '166.67',
        unique_customers: '120'
      }
    });
  }
  
  // 3. Extract Category Sales
  if (isEmpty) {
    responses.push([]);
  } else if (isLowStock || isCritical) {
    responses.push([
      {
        json: {
          category: 'Electronics',
          orders_count: isLowStock ? '80' : '150',
          units_sold: isLowStock ? '250' : '300',
          category_revenue: isLowStock ? '20000.00' : '35000.00'
        }
      },
      {
        json: {
          category: isLowStock ? 'Toys' : 'Accessories',
          orders_count: isLowStock ? '120' : '150',
          units_sold: isLowStock ? '400' : '500',
          category_revenue: '15000.00'
        }
      }
    ]);
  } else {
    responses.push([
      {
        json: {
          category: 'Electronics',
          orders_count: '45',
          units_sold: '120',
          category_revenue: '12000.00'
        }
      },
      {
        json: {
          category: 'Clothing',
          orders_count: '60',
          units_sold: '200',
          category_revenue: '8000.00'
        }
      },
      {
        json: {
          category: 'Home & Garden',
          orders_count: '45',
          units_sold: '80',
          category_revenue: '5000.00'
        }
      }
    ]);
  }
  
  // 4. Extract Top Products
  if (isEmpty) {
    responses.push([]);
  } else if (isCritical) {
    // Critical low stock scenario
    responses.push([
      {
        json: {
          product_id: 20,
          product_name: 'Smartphone X',
          sku: 'PHONE-001',
          units_sold: '50',
          revenue: '25000.00',
          current_stock: '10'  // Critical!
        }
      },
      {
        json: {
          product_id: 21,
          product_name: 'Tablet Pro',
          sku: 'TAB-001',
          units_sold: '30',
          revenue: '15000.00',
          current_stock: '5'   // Critical!
        }
      },
      {
        json: {
          product_id: 22,
          product_name: 'Smart Watch',
          sku: 'WATCH-001',
          units_sold: '40',
          revenue: '8000.00',
          current_stock: '15'  // Critical!
        }
      },
      {
        json: {
          product_id: 23,
          product_name: 'Wireless Charger',
          sku: 'CHRG-001',
          units_sold: '60',
          revenue: '3000.00',
          current_stock: '20'  // Critical!
        }
      }
    ]);
  } else if (isLowStock) {
    // Regular low stock scenario
    responses.push([
      {
        json: {
          product_id: 10,
          product_name: 'Gaming Console',
          sku: 'GAME-001',
          units_sold: '100',
          revenue: '30000.00',
          current_stock: '50'  // Low stock!
        }
      },
      {
        json: {
          product_id: 11,
          product_name: 'Popular Board Game',
          sku: 'TOY-002',
          units_sold: '200',
          revenue: '4000.00',
          current_stock: '100'  // Low stock!
        }
      },
      {
        json: {
          product_id: 12,
          product_name: 'Action Figure Set',
          sku: 'TOY-003',
          units_sold: '150',
          revenue: '3000.00',
          current_stock: '80'   // Low stock!
        }
      }
    ]);
  } else {
    // Normal stock levels
    responses.push([
      {
        json: {
          product_id: 1,
          product_name: 'Smart TV 55 inch',
          sku: 'TV-001',
          units_sold: '25',
          revenue: '15000.00',
          current_stock: '200'
        }
      },
      {
        json: {
          product_id: 2,
          product_name: 'Wireless Headphones',
          sku: 'HP-002',
          units_sold: '50',
          revenue: '5000.00',
          current_stock: '500'
        }
      }
    ]);
  }
  
  // The workflow will transform this data and determine if inventory alerts are needed
  // based on the current_stock vs units_sold ratio
  
  return responses;
}
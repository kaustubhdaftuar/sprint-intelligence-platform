// MongoDB Initialization Script
// This script runs when the MongoDB container is first created

db = db.getSiblingDB('sprint-intelligence');

// Create collections with validators
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password', 'name', 'role'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        role: {
          enum: ['admin', 'manager', 'developer']
        }
      }
    }
  }
});

// Create indexes for users
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });

// Create projects collection
db.createCollection('projects');
db.projects.createIndex({ key: 1 }, { unique: true });
db.projects.createIndex({ ownerId: 1 });
db.projects.createIndex({ teamMembers: 1 });

// Create sprints collection
db.createCollection('sprints');
db.sprints.createIndex({ projectId: 1, status: 1 });
db.sprints.createIndex({ startDate: 1, endDate: 1 });

// Create tickets collection
db.createCollection('tickets');
db.tickets.createIndex({ projectId: 1, ticketNumber: 1 }, { unique: true });
db.tickets.createIndex({ key: 1 }, { unique: true });
db.tickets.createIndex({ sprintId: 1, status: 1 });
db.tickets.createIndex({ assignedTo: 1 });
db.tickets.createIndex({ lastActivityAt: 1 });
db.tickets.createIndex({ isBlocked: 1 });

// Create AI insights collection
db.createCollection('aiinsights');
db.aiinsights.createIndex({ entityId: 1, type: 1 });
db.aiinsights.createIndex({ createdAt: 1 });

print('Database initialized successfully!');
print('Collections created: users, projects, sprints, tickets, aiinsights');
print('Indexes created for optimal query performance');
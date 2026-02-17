.PHONY: help install dev build test clean docker-build docker-push k8s-deploy k8s-delete

# Variables
DOCKER_REGISTRY ?= ghcr.io/your-username
VERSION ?= latest

help: ## Show this help message
	@echo "Sprint Intelligence Platform - Makefile Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies for all services
	@echo "Installing API service dependencies..."
	cd services/api && npm install
	@echo "Done!"

dev: ## Start development environment with docker-compose
	docker-compose up -d
	@echo "Development environment started!"
	@echo "API: http://localhost:4000"
	@echo "MongoDB: localhost:27017"
	@echo "Redis: localhost:6379"

dev-logs: ## View logs from all services
	docker-compose logs -f

dev-stop: ## Stop development environment
	docker-compose down

dev-clean: ## Stop and remove all containers, volumes
	docker-compose down -v
	@echo "Development environment cleaned!"

build: ## Build TypeScript for all services
	@echo "Building API service..."
	cd services/api && npm run build
	@echo "Build complete!"

test: ## Run tests for all services
	@echo "Testing API service..."
	cd services/api && npm test
	@echo "Tests complete!"

clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	find . -name "dist" -type d -exec rm -rf {} +
	find . -name "node_modules" -type d -exec rm -rf {} +
	@echo "Clean complete!"

docker-build: ## Build Docker images for all services
	@echo "Building Docker images..."
	docker build -t $(DOCKER_REGISTRY)/api-service:$(VERSION) services/api
	# Add more services as implemented
	@echo "Docker images built!"

docker-push: ## Push Docker images to registry
	@echo "Pushing Docker images..."
	docker push $(DOCKER_REGISTRY)/api-service:$(VERSION)
	@echo "Images pushed!"

k8s-start-minikube: ## Start minikube cluster
	minikube start --cpus=4 --memory=8192
	minikube addons enable ingress
	@echo "Minikube started!"

k8s-deploy: ## Deploy to Kubernetes
	@echo "Deploying to Kubernetes..."
	kubectl apply -f k8s/
	@echo "Deployment complete!"
	@echo "Waiting for rollout..."
	kubectl rollout status deployment/api-service

k8s-delete: ## Delete Kubernetes resources
	kubectl delete -f k8s/
	@echo "Resources deleted!"

k8s-status: ## Check Kubernetes deployment status
	@echo "=== Pods ==="
	kubectl get pods
	@echo ""
	@echo "=== Services ==="
	kubectl get services
	@echo ""
	@echo "=== Ingress ==="
	kubectl get ingress
	@echo ""
	@echo "=== HPA ==="
	kubectl get hpa

k8s-logs: ## Tail logs from API service
	kubectl logs -f deployment/api-service

k8s-shell: ## Open shell in API service pod
	kubectl exec -it deployment/api-service -- /bin/sh

db-backup: ## Backup MongoDB database
	@echo "Creating MongoDB backup..."
	kubectl exec -it mongodb-0 -- mongodump --uri="mongodb://admin:changeme-in-production@localhost:27017/sprint-intelligence?authSource=admin" --out=/backup
	kubectl cp mongodb-0:/backup ./backup-$$(date +%Y%m%d-%H%M%S)
	@echo "Backup complete!"

db-restore: ## Restore MongoDB database (requires BACKUP_DIR env var)
	@echo "Restoring MongoDB from $(BACKUP_DIR)..."
	kubectl cp $(BACKUP_DIR) mongodb-0:/restore
	kubectl exec -it mongodb-0 -- mongorestore --uri="mongodb://admin:changeme-in-production@localhost:27017/sprint-intelligence?authSource=admin" /restore
	@echo "Restore complete!"

lint: ## Run linter
	cd services/api && npm run lint

format: ## Format code
	cd services/api && npm run format

setup: install ## Initial project setup
	@echo "Setting up project..."
	cp services/api/.env.example services/api/.env
	@echo "Created .env file - please update with your values"
	@echo "Setup complete!"

ci: lint test build ## Run CI checks locally
	@echo "All CI checks passed!"
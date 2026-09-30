# Contabilidad · Plan de cuentas

Árbol de cuentas. Ejemplo: Activo → Disponibilidades → Banco → Banco de Corrientes Cuenta Corriente.

Colección Atlas: `contabilidad.accounts`.

## Local

```bash
npm install
npm start
```

## Cloud Run

```bash
export GCP_PROJECT_ID=project-778283d9-dc7e-4c2c-947
export MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER.mongodb.net/contabilidad?retryWrites=true&w=majority&authSource=admin"

gcloud run deploy contabilidad-vanilla \
  --project $GCP_PROJECT_ID \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --update-env-vars="MONGODB_URI=${MONGODB_URI},MONGODB_DB=contabilidad,MONGODB_COLLECTION=accounts"
```

## API

- `GET /api/accounts`
- `POST /api/accounts` `{ name, parentId, code, nature }`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `GET /health`

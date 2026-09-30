# Contabilidad · Plan de cuentas (RT FACPCE)

Codificación decimal de 5 niveles: capítulo, rubro, subrubro, cuenta y subcuenta.

Ejemplo de 5 niveles:

`1.0 ACTIVO` → `1.1 Activo Corriente` → `1.1.01 Caja y Bancos` → `1.1.01.01 Banco` → `1.1.01.01.01 Banco de Corrientes Cuenta Corriente`

Colección Atlas: `contabilidad.accounts`.

Si Atlas ya tenía el plan viejo, borrá la colección `accounts` y redeploy / reiniciá para que cargue este seed.

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

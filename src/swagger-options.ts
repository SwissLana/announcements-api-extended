// Presentation settings for Swagger only; API schemas and handlers are unchanged.
export const swaggerOptions = {
  swaggerOptions: {
    defaultModelExpandDepth: 3,
    defaultModelsExpandDepth: 3,
  },
  customCss: `
    .swagger-ui .auth-btn-wrapper {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
      padding-top: 20px;
    }
    .swagger-ui .auth-btn-wrapper .btn {
      margin: 0;
      min-width: 110px;
    }
    .swagger-ui .auth-container input[type=text] {
      width: 100%;
      box-sizing: border-box;
    }
    .swagger-ui .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .swagger-ui .btn-group .btn {
      flex: 1;
      width: auto;
      min-width: 110px;
      border-radius: 4px;
    }
    .swagger-ui table.model {
      border-collapse: separate;
      border-spacing: 0;
    }
    .swagger-ui table.model tbody tr.property-row > td {
      padding: 6px 12px;
      vertical-align: top;
      line-height: 24px;
    }
    .swagger-ui table.model tbody tr.property-row > td:first-child {
      padding: 6px 12px 6px 16px;
    }
    .swagger-ui .model-box-control {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 24px;
      padding: 0;
      line-height: 24px;
      vertical-align: top;
    }
    .swagger-ui .model .prop {
      line-height: 24px;
    }
    .swagger-ui .model-toggle {
      top: 0;
      margin: 0 4px;
    }
    .swagger-ui section.models .model-container {
      overflow-x: auto;
    }
  `,
};

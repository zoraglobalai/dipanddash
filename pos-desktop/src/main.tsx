import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";

import { App } from "@/app/App";
import { posTheme } from "@/app/theme";
import { PosAuthProvider } from "@/app/PosAuthContext";
import "@/styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ChakraProvider theme={posTheme}>
      <PosAuthProvider>
        <App />
      </PosAuthProvider>
    </ChakraProvider>
  </React.StrictMode>
);

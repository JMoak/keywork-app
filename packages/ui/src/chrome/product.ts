import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { createContext, useContext } from "solid-js";

const ProductContext = createContext<ProductProfile>(keyworkProfile);

export const ProductProvider = ProductContext.Provider;

export function useProductProfile(): ProductProfile {
  return useContext(ProductContext);
}

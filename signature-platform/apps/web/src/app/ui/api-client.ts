export async function apiRequest<T = unknown>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch((process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001')+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem('signeo_access_token')??''),...options.headers}});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(data?.message??'Service indisponible. Réessayez.');
 return data as T;
}
export function clearSession(){localStorage.removeItem('signeo_access_token');localStorage.removeItem('signeo_user');window.location.assign('/connexion');}
